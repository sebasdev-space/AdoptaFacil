import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ADOPTION_CONTRACT_APPLICABLE_LAWS,
  type AdoptionAnimalSnapshot,
  type AdoptionApplicant,
  type AdoptionContract,
  type AdoptionContractPayload,
  type AdoptionContractSigner,
  type AdoptionContractStatus,
  type GenerateAdoptionContractInput,
  type SignAdoptionContractInput,
  type SignaturePort,
  type TransitionAdoptionContractInput,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditService } from '../../core/audit/audit.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { checkContractTransition } from './adoption-contract-status';
import { computeContractHash } from './adoption-contract-hash';
import { SIGNATURE_PORT } from './signature/signature.port';

/**
 * Cláusulas por defecto del contrato (parametrizable por el cliente: TODO(client)).
 * Declara explícitamente el marco legal (RNF10): Ley 527/1999 (validez de la firma
 * electrónica) y Ley 1581/2012 (tratamiento de datos personales).
 */
const DEFAULT_TERMS =
  'Contrato de adopción responsable. La firma electrónica de las partes tiene plena ' +
  'validez conforme a la Ley 527/1999. El tratamiento de los datos personales de los ' +
  'firmantes se rige por la Ley 1581/2012. El adoptante se compromete al cuidado ' +
  'responsable del animal aquí referenciado.';

/** Row shape returned by the SECURITY DEFINER contract functions (snake_case). */
interface ContractRow {
  id: string;
  organization_id: string;
  request_id: string;
  animal_id: string;
  version: number;
  status: string;
  signers: AdoptionContractSigner[];
  payload: AdoptionContractPayload;
  content_hash: string | null;
  created_at: Date;
  updated_at: Date;
  signed_at: Date | null;
}

type ContractModel = Prisma.AdoptionContractGetPayload<Record<string, never>>;

@Injectable()
export class AdoptionContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(SIGNATURE_PORT) private readonly signature: SignaturePort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Generate the contract for an APPROVED request (§M04, RF11). Org-gated at the
   * controller (Owner/Administrator/Operator). Builds the dynamic signer list
   * (org representative = the actor + adopter = the request's applicant, plus any
   * extra signers), starts it in `draft`, materializes T-028a's `contractRef`
   * seam, and AUDITS the generation (UTC, no PII).
   */
  async generate(
    actor: RequestUser,
    input: GenerateAdoptionContractInput,
  ): Promise<AdoptionContract> {
    const organizationId = this.requireOrgId();
    const created = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const req = await tx.adoptionRequest.findUnique({ where: { id: input.requestId } });
      if (!req || req.organizationId !== organizationId) {
        throw new NotFoundException('Solicitud de adopción no encontrada.');
      }
      if (req.status !== 'approved') {
        throw new ConflictException('La solicitud debe estar aprobada para generar el contrato.');
      }
      const existing = await tx.adoptionContract.findFirst({
        where: { requestId: input.requestId },
      });
      if (existing) {
        throw new ConflictException('Ya existe un contrato para esta solicitud.');
      }

      const applicant = req.applicant as unknown as AdoptionApplicant;
      const animal = req.animalSnapshot as unknown as AdoptionAnimalSnapshot;

      const signers: AdoptionContractSigner[] = [
        {
          id: randomUUID(),
          role: 'organization_representative',
          // TODO(client): representative name/identity configurable; here the
          // generating org member acts as the representative.
          fullName: 'Representante de la organización',
          email: actor.email,
          userId: actor.id,
        },
        {
          id: randomUUID(),
          role: 'adopter',
          fullName: applicant.fullName,
          email: applicant.email,
          userId: req.applicantUserId,
        },
        ...(input.additionalSigners ?? []).map((s) => ({
          id: randomUUID(),
          role: s.role,
          fullName: s.fullName,
          email: s.email,
          userId: s.userId,
        })),
      ];

      const payload: AdoptionContractPayload = {
        requestId: input.requestId,
        organizationId,
        animalId: req.animalId,
        animal,
        applicant,
        applicableLaws: ADOPTION_CONTRACT_APPLICABLE_LAWS,
        terms: input.terms?.trim() || DEFAULT_TERMS,
      };

      const row = await tx.adoptionContract.create({
        data: {
          organizationId,
          requestId: input.requestId,
          animalId: req.animalId,
          version: 1,
          status: 'draft',
          signers: signers as unknown as Prisma.InputJsonValue,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });

      // Materialize the T-028a seam: the request now points at its contract.
      await tx.adoptionRequest.update({
        where: { id: input.requestId },
        data: { contractRef: row.id },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.contract.generated',
        entityType: 'adoption_contract',
        entityId: row.id,
        metadata: { requestId: input.requestId, signerCount: signers.length },
      });

      return row;
    });

    return this.fromModel(created);
  }

  /** The contract of a given request, for the OWNING org (RLS-scoped). */
  async getForOrg(requestId: string): Promise<AdoptionContract> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.adoptionContract.findFirst({ where: { requestId } }),
    );
    if (!row) {
      throw new NotFoundException('Contrato no encontrado.');
    }
    return this.fromModel(row);
  }

  /**
   * A contract visible to a legitimate SIGNER (org representative or the adopter),
   * resolved cross-tenant via the SECURITY DEFINER function so the adopter (a
   * Person in another tenant) can fetch the contract they must sign.
   */
  async getForSigner(actor: RequestUser, contractId: string): Promise<AdoptionContract> {
    const row = await this.loadForSigner(contractId, actor.id);
    if (!row) {
      throw new NotFoundException('Contrato no encontrado o no eres firmante.');
    }
    return this.fromRow(row);
  }

  /**
   * Move the contract through the org-managed transitions (draft →
   * pending_signatures, or cancel). Org-gated at the controller. A `signed`
   * contract is terminal/immutable → 409.
   */
  async transition(
    actor: RequestUser,
    contractId: string,
    input: TransitionAdoptionContractInput,
  ): Promise<AdoptionContract> {
    const organizationId = this.requireOrgId();
    const updated = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const current = await tx.adoptionContract.findUnique({ where: { id: contractId } });
      if (!current || current.organizationId !== organizationId) {
        throw new NotFoundException('Contrato no encontrado.');
      }
      const check = checkContractTransition(
        current.status as AdoptionContractStatus,
        input.targetStatus,
      );
      if (!check.allowed) {
        throw new ConflictException(check.error);
      }
      const next = await tx.adoptionContract.update({
        where: { id: contractId },
        data: { status: input.targetStatus },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.contract.transitioned',
        entityType: 'adoption_contract',
        entityId: contractId,
        metadata: {
          from: current.status,
          to: input.targetStatus,
          reason: input.reason?.trim() || null,
        },
      });
      return next;
    });
    return this.fromModel(updated);
  }

  /**
   * Sign one party's part (§M04, RF11) via the simulable {@link SignaturePort}.
   * Works for the adopter (cross-tenant) and the org representative through the
   * same SECURITY DEFINER path. When ALL signers have signed, the canonical
   * payload hash is computed and the contract is SEALED (`signed`, immutable).
   * Each signature and the sealing are AUDITED in UTC (no PII in clear).
   */
  async sign(
    actor: RequestUser,
    contractId: string,
    input: SignAdoptionContractInput,
  ): Promise<AdoptionContract> {
    const row = await this.loadForSigner(contractId, actor.id);
    if (!row) {
      throw new NotFoundException('Contrato no encontrado o no eres firmante.');
    }
    if (row.status !== 'pending_signatures') {
      if (row.status === 'signed') {
        throw new ConflictException('El contrato ya está firmado (inmutable).');
      }
      throw new ConflictException(
        `El contrato no está disponible para firma (estado: ${row.status}).`,
      );
    }

    const signers = row.signers;
    const signer = signers.find((s) => s.id === input.signerId);
    if (!signer) {
      throw new NotFoundException('Firmante no encontrado en el contrato.');
    }
    if (signer.userId !== actor.id) {
      throw new ForbiddenException('No puedes firmar por otra persona.');
    }
    if (signer.signedAt) {
      throw new ConflictException('Esa parte ya fue firmada.');
    }

    const documentHash = computeContractHash(row.payload);
    const result = await this.signature.sign({
      contractId,
      signerId: signer.id,
      signerRole: signer.role,
      documentHash,
    });

    const nextSigners: AdoptionContractSigner[] = signers.map((s) =>
      s.id === signer.id ? { ...s, signedAt: result.signedAt, signatureId: result.signatureId } : s,
    );
    const allSigned = nextSigners.every((s) => Boolean(s.signedAt));
    const contentHash = allSigned ? documentHash : null;

    const updatedRows = await this.prisma.$queryRaw<ContractRow[]>(Prisma.sql`
      SELECT * FROM adoption_contract_apply_signatures(
        ${contractId}::uuid,
        ${actor.id}::uuid,
        ${JSON.stringify(nextSigners)}::jsonb,
        ${allSigned},
        ${contentHash}
      )
    `);
    const updated = updatedRows[0];
    if (!updated) {
      throw new ConflictException('No se pudo registrar la firma (el estado cambió).');
    }

    const organizationId = row.organization_id;
    await this.audit.record({
      organizationId,
      actorUserId: actor.id,
      action: 'adoption.contract.signed',
      entityType: 'adoption_contract',
      entityId: contractId,
      metadata: { signerId: signer.id, role: signer.role, provider: result.provider },
    });
    if (allSigned) {
      await this.audit.record({
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.contract.sealed',
        entityType: 'adoption_contract',
        entityId: contractId,
        metadata: { contentHash },
      });
    }

    return this.fromRow(updated);
  }

  /** Load a contract for a signer via the SECURITY DEFINER function (cross-tenant). */
  private async loadForSigner(contractId: string, userId: string): Promise<ContractRow | null> {
    const rows = await this.prisma.$queryRaw<ContractRow[]>(Prisma.sql`
      SELECT * FROM adoption_contract_for_signer(${contractId}::uuid, ${userId}::uuid)
    `);
    return rows[0] ?? null;
  }

  private fromRow(row: ContractRow): AdoptionContract {
    return {
      id: row.id,
      organizationId: row.organization_id,
      requestId: row.request_id,
      animalId: row.animal_id,
      version: row.version,
      status: row.status as AdoptionContractStatus,
      signers: row.signers,
      payload: row.payload,
      contentHash: row.content_hash ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      signedAt: row.signed_at ? row.signed_at.toISOString() : undefined,
    };
  }

  private fromModel(row: ContractModel): AdoptionContract {
    return {
      id: row.id,
      organizationId: row.organizationId,
      requestId: row.requestId,
      animalId: row.animalId,
      version: row.version,
      status: row.status as AdoptionContractStatus,
      signers: row.signers as unknown as AdoptionContractSigner[],
      payload: row.payload as unknown as AdoptionContractPayload,
      contentHash: row.contentHash ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      signedAt: row.signedAt ? row.signedAt.toISOString() : undefined,
    };
  }
}
