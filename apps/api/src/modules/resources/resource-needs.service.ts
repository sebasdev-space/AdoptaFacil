import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ResourceNeed as ResourceNeedRow } from '@prisma/client';
import {
  type CreateResourceNeedInput,
  type ResourceCategory,
  type ResourceNeed,
  ResourceNeedStatus,
  type ResourceNeedsOwnPage,
  type UpdateResourceNeedInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { computeFulfillmentProgress } from './resource-fulfillment';

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;

/** Clamp a requested page size to [1, MAX_PAGE] — shared by every list read
 *  in this module (needs, offers, evidences, public catalog). */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE);
}

export function toNeed(row: ResourceNeedRow): ResourceNeed {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category as ResourceCategory,
    quantityNeeded: row.quantityNeeded,
    unit: row.unit,
    quantityFulfilled: row.quantityFulfilled,
    progress: computeFulfillmentProgress(row.quantityFulfilled, row.quantityNeeded),
    status: row.status as ResourceNeedStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * M09 (banco de recursos) — necesidades publicadas por la organización.
 * Tenant-scoped (RLS): create/list/get/update siempre bajo `withOrgContext`.
 * `quantityFulfilled`/`status` (más allá de `cancelled`) son derivados por
 * las entregas completadas (ver `ResourceDeliveriesService`) — nunca
 * editables directamente aquí.
 */
@Injectable()
export class ResourceNeedsService {
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

  /** Publicar una necesidad (needed, 0 cubierto); auditado. */
  async create(actorUserId: string, input: CreateResourceNeedInput): Promise<ResourceNeed> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.resourceNeed.create({
        data: {
          organizationId,
          title: input.title,
          description: input.description ?? null,
          category: input.category,
          quantityNeeded: input.quantityNeeded,
          unit: input.unit,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'resource_need.created',
        entityType: 'resource_need',
        entityId: row.id,
        metadata: { category: input.category, quantityNeeded: input.quantityNeeded },
      });
      return toNeed(row);
    });
  }

  /** Página de las necesidades de la organización, más recientes primero. */
  async list(limit: number, offset: number): Promise<ResourceNeedsOwnPage> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.resourceNeed.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        tx.resourceNeed.count({ where: { organizationId } }),
      ]);
      return { items: rows.map(toNeed), total, limit: take, offset: skip };
    });
  }

  /** Una necesidad de la organización. */
  async get(id: string): Promise<ResourceNeed> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.resourceNeed.findUnique({ where: { id } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Resource need not found');
    }
    return toNeed(row);
  }

  /** Editar una necesidad; la única transición manual de estado es a
   *  `cancelled` (validado por el schema Zod). Auditado. */
  async update(
    actorUserId: string,
    id: string,
    input: UpdateResourceNeedInput,
  ): Promise<ResourceNeed> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.resourceNeed.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Resource need not found');
      }
      const updated = await tx.resourceNeed.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          quantityNeeded: input.quantityNeeded,
          unit: input.unit,
          status: input.status,
        },
      });
      const statusChanged = input.status !== undefined && input.status !== existing.status;
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: statusChanged ? 'resource_need.status_changed' : 'resource_need.updated',
        entityType: 'resource_need',
        entityId: id,
        metadata: statusChanged
          ? { from: existing.status, to: input.status }
          : { fields: Object.keys(input) },
      });
      return toNeed(updated);
    });
  }
}
