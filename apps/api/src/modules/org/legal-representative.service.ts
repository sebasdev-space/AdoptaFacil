import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { LegalRepresentative as LegalRepresentativeRow } from '@prisma/client';
import {
  type LegalRepresentative,
  type LegalRepresentativeDocumentType,
  type LegalRepresentativeStatus,
  type RegisterLegalRepresentativeInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import {
  LEGAL_REPRESENTATIVE_CONFIG,
  encryptSignature,
  hashSignature,
  type LegalRepresentativeConfig,
} from './legal-representative-crypto';

function toContract(row: LegalRepresentativeRow): LegalRepresentative {
  return {
    id: row.id,
    organizationId: row.organizationId,
    memberId: row.memberId,
    fullName: row.fullName,
    documentType: row.documentType as LegalRepresentativeDocumentType,
    documentNumber: row.documentNumber,
    position: row.position,
    signatureFileRef: row.signatureFileRef,
    signatureHash: row.signatureHash,
    status: row.status as LegalRepresentativeStatus,
    signedAt: row.signedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * M01 legal representative signature (S-1, RF14 relacionado / RNF10),
 * tenant-scoped via RLS. `legal_representatives` is append-only (DB-enforced,
 * see the migration): registering again never mutates the previous row — it
 * inserts a new one, and "vigente" is always the most recently `signedAt`
 * record for the organization, computed here at read time.
 */
@Injectable()
export class LegalRepresentativeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(LEGAL_REPRESENTATIVE_CONFIG) private readonly config: LegalRepresentativeConfig,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Register (or re-register, e.g. a change of representative) the CALLER's
   * own signature. `memberId` is ALWAYS the authenticated actor, never a
   * client-supplied id — combined with the controller's `@Roles(Role.Owner)`
   * gate, this makes "only the Owner can create/update THEIR OWN signature"
   * structurally true rather than an extra check to remember.
   *
   * The signature is encrypted (AES-256-GCM) BEFORE it ever reaches
   * StoragePort — no plaintext bytes are written anywhere, not even
   * transiently — and only its SHA-256 hash + the encrypted file's opaque key
   * are persisted. Audit metadata never includes the signature content.
   */
  async register(
    actorUserId: string,
    input: RegisterLegalRepresentativeInput,
  ): Promise<LegalRepresentative> {
    const organizationId = this.requireOrgId();

    const plaintext = Buffer.from(input.signatureBase64, 'base64');
    if (plaintext.length === 0) {
      throw new BadRequestException('La firma está vacía o no es una imagen válida.');
    }

    const signatureHash = hashSignature(plaintext);
    const encrypted = encryptSignature(plaintext, this.config.signatureEncryptionKey);

    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: 'signature.enc',
      visibility: 'private',
    });
    await this.storage.saveObject(stored.key, encrypted, 'application/octet-stream');

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const signedAt = new Date();
      const row = await tx.legalRepresentative.create({
        data: {
          organizationId,
          memberId: actorUserId,
          fullName: input.fullName.trim(),
          documentType: input.documentType,
          documentNumber: input.documentNumber.trim(),
          position: input.position.trim(),
          signatureFileRef: stored.key,
          signatureHash,
          signedAt,
        },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'organization.legal_representative_registered',
        entityType: 'legal_representative',
        entityId: row.id,
        // Metadata only — NEVER the signature bytes/content, only identifiers.
        metadata: { fullName: row.fullName, position: row.position },
      });

      return toContract(row);
    });
  }

  /** The CURRENT (most recently signed) legal representative for the caller's
   *  org, or `null` when none has been registered yet. */
  async getCurrent(): Promise<LegalRepresentative | null> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.legalRepresentative.findFirst({
        where: { organizationId },
        orderBy: { signedAt: 'desc' },
      }),
    );
    return row ? toContract(row) : null;
  }
}
