import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type CampaignCategory,
  type CampaignPublic,
  type CampaignStatus,
  type Paginated,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { computeProgress } from './campaign-progress';
import { clampLimit } from './campaigns.service';

/** Raw public campaign row emitted by the SECURITY DEFINER functions (no progress). */
interface RawPublicCampaign {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description: string | null;
  category: string;
  goalAmount: number;
  raisedAmount: number;
  deadline: string;
  status: string;
  createdAt: string;
}

function toPublic(raw: RawPublicCampaign): CampaignPublic {
  return {
    id: raw.id,
    organizationId: raw.organizationId,
    organizationName: raw.organizationName,
    title: raw.title,
    description: raw.description ?? undefined,
    category: raw.category as CampaignCategory,
    goalAmount: raw.goalAmount,
    raisedAmount: raw.raisedAmount,
    progress: computeProgress(raw.raisedAmount, raw.goalAmount),
    deadline: raw.deadline,
    status: raw.status as CampaignStatus,
    createdAt: raw.createdAt,
  };
}

/**
 * Public (no-session) campaign reads. Cross-tenant exposure goes through the
 * bounded SECURITY DEFINER functions (public_campaigns / public_campaign) — never
 * a raw RLS-evading select — so only public columns ever leave the DB.
 */
@Injectable()
export class PublicCampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active campaigns across organizations (paginated, public columns only). */
  async list(limit: number, offset: number): Promise<Paginated<CampaignPublic>> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawPublicCampaign[]; total: number } }>
    >(Prisma.sql`SELECT public_campaigns(${take}::int, ${skip}::int) AS data`);
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map(toPublic),
      total: data.total ?? 0,
      limit: take,
      offset: skip,
    };
  }

  /** One public campaign by id (active/closed only), or null. */
  async get(id: string): Promise<CampaignPublic | null> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPublicCampaign | null }>>(
      Prisma.sql`SELECT public_campaign(${id}::uuid) AS data`,
    );
    const raw = rows[0]?.data ?? null;
    return raw ? toPublic(raw) : null;
  }
}
