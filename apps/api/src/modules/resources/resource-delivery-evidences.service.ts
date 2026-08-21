import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ResourceDeliveryEvidence as EvidenceRow } from '@prisma/client';
import {
  type CreateResourceDeliveryEvidenceInput,
  type ResourceDeliveryEvidence,
  type ResourceDeliveryEvidenceUploadResult,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';

function toEvidence(row: EvidenceRow, storage: StoragePort): ResourceDeliveryEvidence {
  return {
    id: row.id,
    organizationId: row.organizationId,
    deliveryId: row.deliveryId,
    caption: row.caption ?? undefined,
    storageRef: row.storageRef,
    url: storage.resolvePublicUrl(row.storageRef),
    order: row.order,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * M09 — evidencia fotográfica de una entrega. Tenant-scoped (RLS), anidada
 * bajo una entrega. Reservada como PÚBLICA en StoragePort (mismo patrón que
 * `CampaignEvidence`) — no es información sensible (una foto del recurso
 * entregado), y `GET /storage/private` solo lo puede descargar el Owner de
 * la organización (ver `StorageController`), lo que dejaría a
 * Administrator/Operator — quienes de verdad gestionan entregas — sin poder
 * ver sus propias fotos si fuera privada. El ENDPOINT que lista/gestiona
 * evidencias sigue gateado por RBAC (Owner/Administrator/Operator) igual que
 * el resto del módulo; solo el ARCHIVO en sí se sirve abiertamente por su key
 * (impredecible por diseño de `storage-keys.ts`). Borrado lógico
 * (`deletedAt`), nunca físico.
 */
@Injectable()
export class ResourceDeliveryEvidencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  async create(
    actorUserId: string,
    deliveryId: string,
    input: CreateResourceDeliveryEvidenceInput,
  ): Promise<ResourceDeliveryEvidenceUploadResult> {
    const organizationId = this.requireOrgId();
    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: input.filename,
      contentType: input.contentType,
      visibility: 'public',
    });
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const delivery = await tx.resourceDelivery.findUnique({ where: { id: deliveryId } });
      if (!delivery) {
        throw new NotFoundException('Resource delivery not found');
      }
      const order =
        input.order ??
        ((
          await tx.resourceDeliveryEvidence.aggregate({
            where: { deliveryId },
            _max: { order: true },
          })
        )._max.order ?? -1) + 1;
      const row = await tx.resourceDeliveryEvidence.create({
        data: {
          organizationId,
          deliveryId,
          caption: input.caption ?? null,
          storageRef: stored.key,
          order,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'resource_delivery.evidence_added',
        entityType: 'resource_delivery_evidence',
        entityId: row.id,
        metadata: { deliveryId },
      });
      return {
        evidence: toEvidence(row, this.storage),
        upload: { url: stored.url, key: stored.key },
      };
    });
  }

  /** Lista (no paginada — no se esperan cientos de fotos por entrega) de las
   *  evidencias no borradas de una entrega, en orden de despliegue. */
  async list(deliveryId: string): Promise<ResourceDeliveryEvidence[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const rows = await tx.resourceDeliveryEvidence.findMany({
        where: { deliveryId, deletedAt: null },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });
      return rows.map((row) => toEvidence(row, this.storage));
    });
  }

  /** Borrado lógico; auditado. Nunca un DELETE físico. */
  async remove(actorUserId: string, deliveryId: string, id: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.resourceDeliveryEvidence.findUnique({ where: { id } });
      if (!existing || existing.deliveryId !== deliveryId || existing.deletedAt) {
        throw new NotFoundException('Evidence not found');
      }
      await tx.resourceDeliveryEvidence.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'resource_delivery.evidence_removed',
        entityType: 'resource_delivery_evidence',
        entityId: id,
      });
    });
  }
}
