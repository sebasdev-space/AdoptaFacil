import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type ResourceOfferProof as ProofRow } from '@prisma/client';
import {
  RESOURCE_OFFER_PROOF_MAX_FILES,
  type ResourceOffer,
  type ResourceOfferProof,
  ResourceOfferProofStatus,
  type ResourceOfferStatus,
  type ValidateResourceOfferProofInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import type { Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { ALLOWED_CONTENT_TYPES } from '../../core/storage/storage-keys';
import { canAttachProof, canValidateProof } from './resource-fulfillment';

/** Minimal shape of a multer memory-storage file (no @types/multer installed). */
export interface UploadedProofFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

interface ProofContextRow {
  organization_id: string;
  status: string;
  proof_status: string | null;
  proof_count: number;
}

/** Row returned by `add_resource_offer_proof` (raw SQL — snake_case). */
interface ProofSqlRow {
  id: string;
  organization_id: string;
  offer_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: Date;
}

function fromSqlRow(row: ProofSqlRow): ResourceOfferProof {
  return {
    id: row.id,
    organizationId: row.organization_id,
    offerId: row.offer_id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at.toISOString(),
  };
}

function toProof(row: ProofRow): ResourceOfferProof {
  return {
    id: row.id,
    organizationId: row.organizationId,
    offerId: row.offerId,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * M09 — prueba (foto/factura) que el DONANTE adjunta al ofrecer y validación
 * EXPLÍCITA de la ORGANIZACIÓN (aprobar / rechazar con motivo), separada de
 * completar la entrega. Adjuntar es cross-tenant por identidad (función
 * SECURITY DEFINER acotada, mismo patrón que `create_resource_offer`); listar,
 * descargar y validar son de la organización sobre SU tenant (RLS). El
 * archivo es PRIVADO en StoragePort (puede ser una factura) y se sirve por
 * este módulo, gateado por RBAC + tenant, con descarga auditada.
 * TODO(client): la aprobación NO gatea completar la entrega (no está fijado).
 */
@Injectable()
export class ResourceOfferProofsService {
  private readonly maxMb: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    config: ConfigService<Env, true>,
  ) {
    this.maxMb = config.get('STORAGE_MAX_FILE_MB', { infer: true });
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** El donante adjunta una prueba a SU PROPIA oferta. */
  async attach(
    actor: RequestUser,
    offerId: string,
    file: UploadedProofFile | undefined,
  ): Promise<ResourceOfferProof> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Se requiere un archivo (campo multipart "file").');
    }
    if (file.size > this.maxMb * 1024 * 1024) {
      throw new PayloadTooLargeException(`El archivo supera el límite de ${this.maxMb} MB.`);
    }
    if (!ALLOWED_CONTENT_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido. Sube una imagen o un PDF.');
    }

    const ctxRows = await this.prisma.$queryRaw<ProofContextRow[]>(
      Prisma.sql`SELECT * FROM resource_offer_proof_context(${offerId}::uuid, ${actor.id}::uuid)`,
    );
    const ctx = ctxRows[0];
    if (!ctx) {
      throw new NotFoundException('Oferta no encontrada o no es tuya.');
    }
    if (
      !canAttachProof(
        ctx.status as ResourceOfferStatus,
        ctx.proof_status as ResourceOfferProofStatus | null,
        ctx.proof_count,
      )
    ) {
      throw new BadRequestException(
        `Ya no se puede adjuntar prueba a esta oferta (cancelada/rechazada, prueba aprobada o máximo de ${RESOURCE_OFFER_PROOF_MAX_FILES} archivos).`,
      );
    }

    const stored = await this.storage.createUploadTarget({
      organizationId: ctx.organization_id,
      filename: file.originalname,
      contentType: file.mimetype,
      visibility: 'private',
    });
    await this.storage.saveObject(stored.key, file.buffer, file.mimetype);

    const rows = await this.prisma.$queryRaw<ProofSqlRow[]>(Prisma.sql`
      SELECT * FROM add_resource_offer_proof(
        ${offerId}::uuid, ${actor.id}::uuid, ${stored.key}, ${file.originalname.slice(0, 255)},
        ${file.mimetype}, ${file.size}::int, ${RESOURCE_OFFER_PROOF_MAX_FILES}::int
      )
    `);
    const row = rows[0];
    if (!row) {
      throw new BadRequestException('No se pudo adjuntar la prueba a esta oferta.');
    }
    await this.audit.record({
      organizationId: ctx.organization_id,
      actorUserId: actor.id,
      action: 'resource_offer.proof_attached',
      entityType: 'resource_offer_proof',
      entityId: row.id,
      metadata: { offerId, contentType: file.mimetype },
    });
    return fromSqlRow(row);
  }

  /** Pruebas de una oferta recibida por la organización. */
  async list(offerId: string): Promise<ResourceOfferProof[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const offer = await tx.resourceOffer.findUnique({ where: { id: offerId } });
      if (!offer) {
        throw new NotFoundException('Resource offer not found');
      }
      const rows = await tx.resourceOfferProof.findMany({
        where: { offerId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toProof);
    });
  }

  /** Bytes de una prueba para la organización dueña; descarga auditada. */
  async download(
    actorUserId: string,
    offerId: string,
    proofId: string,
  ): Promise<{ data: Buffer; contentType: string; filename: string }> {
    const organizationId = this.requireOrgId();
    const proof = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.resourceOfferProof.findUnique({ where: { id: proofId } });
      if (!row || row.offerId !== offerId) {
        throw new NotFoundException('Proof not found');
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'resource_offer.proof_downloaded',
        entityType: 'resource_offer_proof',
        entityId: proofId,
        metadata: { offerId },
      });
      return row;
    });
    const object = await this.storage.readObject(proof.storageRef);
    if (!object) {
      throw new NotFoundException('Proof file not found');
    }
    return {
      data: object.data,
      contentType: object.contentType ?? proof.contentType,
      filename: proof.filename,
    };
  }

  /**
   * La organización aprueba o rechaza (con motivo) la prueba `pending`.
   * Decisión explícita, separada de completar la entrega. Auditada (UTC).
   */
  async validate(
    actorUserId: string,
    offerId: string,
    input: ValidateResourceOfferProofInput,
  ): Promise<ResourceOffer> {
    const organizationId = this.requireOrgId();
    const reason = input.reason?.trim() || null;
    if (input.decision === 'reject' && !reason) {
      throw new BadRequestException('Indica el motivo del rechazo.');
    }
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.resourceOffer.findUnique({ where: { id: offerId } });
      if (!existing) {
        throw new NotFoundException('Resource offer not found');
      }
      if (!canValidateProof(existing.proofStatus as ResourceOfferProofStatus | null)) {
        throw new BadRequestException(
          existing.proofStatus
            ? 'La prueba de esta oferta ya fue validada. El donante debe adjuntar una nueva.'
            : 'Esta oferta no tiene prueba adjunta por validar.',
        );
      }
      const newStatus =
        input.decision === 'approve'
          ? ResourceOfferProofStatus.Approved
          : ResourceOfferProofStatus.Rejected;
      // Atómico frente a una validación concurrente / un adjunto nuevo.
      const result = await tx.resourceOffer.updateMany({
        where: { id: offerId, proofStatus: ResourceOfferProofStatus.Pending },
        data: {
          proofStatus: newStatus,
          proofValidatedByUserId: actorUserId,
          proofValidatedAt: new Date(),
          proofValidationReason: reason,
        },
      });
      if (result.count !== 1) {
        throw new BadRequestException('La prueba ya no está pendiente de validación.');
      }
      const updated = await tx.resourceOffer.findUniqueOrThrow({ where: { id: offerId } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action:
          input.decision === 'approve'
            ? 'resource_offer.proof_approved'
            : 'resource_offer.proof_rejected',
        entityType: 'resource_offer',
        entityId: offerId,
        metadata: { needId: existing.needId, hasReason: Boolean(reason) },
      });
      return {
        id: updated.id,
        organizationId: updated.organizationId,
        needId: updated.needId,
        donorUserId: updated.donorUserId,
        quantityOffered: updated.quantityOffered,
        message: updated.message ?? undefined,
        status: updated.status as ResourceOfferStatus,
        proofStatus: (updated.proofStatus as ResourceOfferProofStatus | null) ?? undefined,
        proofValidatedByUserId: updated.proofValidatedByUserId ?? undefined,
        proofValidatedAt: updated.proofValidatedAt?.toISOString(),
        proofValidationReason: updated.proofValidationReason ?? undefined,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }
}
