import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ResourceOffer as ResourceOfferModel } from '@prisma/client';
import {
  type CreateResourceOfferInput,
  type DecideResourceOfferInput,
  type ResourceOffer,
  ResourceOfferStatus,
  type ResourceOfferWithNeed,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { canDecideOffer } from './resource-fulfillment';

/** Raw JSONB item emitted by `resource_offers_for_donor` (already enriched). */
interface RawOfferWithNeed {
  id: string;
  organizationId: string;
  organizationName: string;
  needId: string;
  needTitle: string;
  needUnit: string;
  donorUserId: string;
  quantityOffered: number;
  message: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  deliveryStatus: string | null;
  deliveryScheduledAt: string | null;
  deliveryCompletedAt: string | null;
}

function toOfferWithNeed(raw: RawOfferWithNeed): ResourceOfferWithNeed {
  return {
    id: raw.id,
    organizationId: raw.organizationId,
    organizationName: raw.organizationName,
    needId: raw.needId,
    needTitle: raw.needTitle,
    needUnit: raw.needUnit,
    donorUserId: raw.donorUserId,
    quantityOffered: raw.quantityOffered,
    message: raw.message ?? undefined,
    status: raw.status as ResourceOfferStatus,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    deliveryStatus: (raw.deliveryStatus as ResourceOfferWithNeed['deliveryStatus']) ?? undefined,
    deliveryScheduledAt: raw.deliveryScheduledAt ?? undefined,
    deliveryCompletedAt: raw.deliveryCompletedAt ?? undefined,
  };
}

/** Row shape returned by `create_resource_offer`/`cancel_resource_offer`
 *  (raw SQL — snake_case; NOT the Prisma Client's camelCase model). */
interface ResourceOfferSqlRow {
  id: string;
  organization_id: string;
  need_id: string;
  donor_user_id: string;
  quantity_offered: number;
  message: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

function fromSqlRow(row: ResourceOfferSqlRow): ResourceOffer {
  return {
    id: row.id,
    organizationId: row.organization_id,
    needId: row.need_id,
    donorUserId: row.donor_user_id,
    quantityOffered: row.quantity_offered,
    message: row.message ?? undefined,
    status: row.status as ResourceOfferStatus,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Row shape returned by the Prisma Client (camelCase) — `listReceived`/`decide`. */
function toOffer(row: ResourceOfferModel): ResourceOffer {
  return {
    id: row.id,
    organizationId: row.organizationId,
    needId: row.needId,
    donorUserId: row.donorUserId,
    quantityOffered: row.quantityOffered,
    message: row.message ?? undefined,
    status: row.status as ResourceOfferStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * M09 — ofertas de donación física. Creación y "mis ofertas" son CROSS-TENANT
 * por identidad (el donante no es miembro de la organización beneficiaria),
 * mismo patrón que M05 `Donation`: funciones SECURITY DEFINER acotadas, nunca
 * una vía que evada RLS de forma general. Decidir (aceptar/rechazar) es una
 * acción de la ORGANIZACIÓN sobre SU PROPIO tenant — RLS normal.
 */
@Injectable()
export class ResourceOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Ofrecer cubrir una necesidad (cualquier autenticado). */
  async create(actor: RequestUser, input: CreateResourceOfferInput): Promise<ResourceOffer> {
    const rows = await this.prisma.$queryRaw<ResourceOfferSqlRow[]>(Prisma.sql`
      SELECT * FROM create_resource_offer(
        ${input.needId}::uuid, ${actor.id}::uuid, ${input.quantityOffered}::int, ${input.message ?? null}
      )
    `);
    const row = rows[0];
    if (!row) {
      throw new BadRequestException(
        'La necesidad no existe o ya no acepta ofertas (cubierta o cancelada).',
      );
    }
    await this.audit.record({
      organizationId: row.organization_id,
      actorUserId: actor.id,
      action: 'resource_offer.created',
      entityType: 'resource_offer',
      entityId: row.id,
      metadata: { needId: input.needId, quantityOffered: input.quantityOffered },
    });
    return fromSqlRow(row);
  }

  /** Ofertas RECIBIDAS por la organización (sus propias necesidades). */
  async listReceived(): Promise<ResourceOffer[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.resourceOffer.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } }),
    );
    return rows.map(toOffer);
  }

  /** Las ofertas del DONANTE (cross-tenant, por identidad), enriquecidas. */
  async listMine(actor: RequestUser): Promise<ResourceOfferWithNeed[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawOfferWithNeed[] }>>(
      Prisma.sql`SELECT resource_offers_for_donor(${actor.id}::uuid) AS data`,
    );
    const items = rows[0]?.data ?? [];
    return items.map(toOfferWithNeed);
  }

  /**
   * La organización acepta o rechaza una oferta `offered` sobre SU necesidad.
   * Al aceptar, crea la entrega (`scheduled`) en la MISMA transacción — no
   * hace falta un paso separado, la organización siempre coordina la entrega
   * después de aceptar. Auditado.
   */
  async decide(
    actorUserId: string,
    offerId: string,
    input: DecideResourceOfferInput,
  ): Promise<ResourceOffer> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.resourceOffer.findUnique({ where: { id: offerId } });
      if (!existing) {
        throw new NotFoundException('Resource offer not found');
      }
      if (!canDecideOffer(existing.status as ResourceOfferStatus)) {
        throw new BadRequestException('Esta oferta ya fue decidida.');
      }

      const newStatus =
        input.decision === 'accept' ? ResourceOfferStatus.Accepted : ResourceOfferStatus.Declined;
      const updated = await tx.resourceOffer.update({
        where: { id: offerId },
        data: { status: newStatus },
      });

      if (input.decision === 'accept') {
        await tx.resourceDelivery.create({
          data: {
            organizationId,
            offerId,
            needId: existing.needId,
          },
        });
      }

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: input.decision === 'accept' ? 'resource_offer.accepted' : 'resource_offer.declined',
        entityType: 'resource_offer',
        entityId: offerId,
        metadata: { needId: existing.needId },
      });
      return toOffer(updated);
    });
  }

  /** El donante cancela SU PROPIA oferta, solo mientras siga `offered`. */
  async cancel(actor: RequestUser, offerId: string): Promise<ResourceOffer> {
    const rows = await this.prisma.$queryRaw<ResourceOfferSqlRow[]>(
      Prisma.sql`SELECT * FROM cancel_resource_offer(${offerId}::uuid, ${actor.id}::uuid)`,
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Oferta no encontrada, no es tuya, o ya no se puede cancelar.');
    }
    await this.audit.record({
      organizationId: row.organization_id,
      actorUserId: actor.id,
      action: 'resource_offer.cancelled',
      entityType: 'resource_offer',
      entityId: row.id,
      metadata: { needId: row.need_id },
    });
    return fromSqlRow(row);
  }
}
