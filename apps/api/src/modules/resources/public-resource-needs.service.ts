import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type ResourceCategory,
  type ResourceNeedPublic,
  type ResourceNeedsPage,
  ResourceNeedStatus,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { clampLimit } from './resource-needs.service';

/** Raw public need row emitted by the SECURITY DEFINER functions. */
interface RawPublicNeed {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description: string | null;
  category: string;
  quantityNeeded: number;
  unit: string;
  quantityFulfilled: number;
  status: string;
  createdAt: string;
}

function toPublic(raw: RawPublicNeed): ResourceNeedPublic {
  return {
    id: raw.id,
    organizationId: raw.organizationId,
    organizationName: raw.organizationName,
    title: raw.title,
    description: raw.description ?? undefined,
    category: raw.category as ResourceCategory,
    quantityNeeded: raw.quantityNeeded,
    unit: raw.unit,
    quantityFulfilled: raw.quantityFulfilled,
    progress: computeProgressClamped(raw.quantityFulfilled, raw.quantityNeeded),
    status: raw.status as ResourceNeedStatus,
    createdAt: raw.createdAt,
  };
}

// Kept local (not imported from resource-fulfillment.ts) to avoid pulling a
// server-only helper's import graph into what's otherwise a thin mapper —
// same clamp math, duplicated on purpose (2 lines, not worth an import).
function computeProgressClamped(fulfilled: number, needed: number): number {
  if (needed <= 0) return 0;
  return Math.min(1, Math.max(0, fulfilled / needed));
}

/**
 * PUBLIC (no-session) need reads for the donor-facing catalog (M09). Cross-
 * tenant exposure goes through bounded SECURITY DEFINER functions
 * (`public_resource_needs`/`public_resource_need`) — never a raw RLS-evading
 * select — so only public columns ever leave the DB. Mirrors
 * `PublicCampaignsService`.
 */
@Injectable()
export class PublicResourceNeedsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Needs still accepting help, across organizations (paginated). */
  async list(limit: number, offset: number): Promise<ResourceNeedsPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawPublicNeed[]; total: number } }>
    >(Prisma.sql`SELECT public_resource_needs(${take}::int, ${skip}::int) AS data`);
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map(toPublic),
      total: data.total ?? 0,
      limit: take,
      offset: skip,
    };
  }

  /** One public need by id (needed/partially_fulfilled/fulfilled), or null. */
  async get(id: string): Promise<ResourceNeedPublic | null> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPublicNeed | null }>>(
      Prisma.sql`SELECT public_resource_need(${id}::uuid) AS data`,
    );
    const raw = rows[0]?.data ?? null;
    return raw ? toPublic(raw) : null;
  }
}
