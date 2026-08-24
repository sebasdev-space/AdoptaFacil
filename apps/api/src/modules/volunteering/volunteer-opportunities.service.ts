import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { VolunteerOpportunity as OpportunityRow } from '@prisma/client';
import {
  type CreateVolunteerOpportunityInput,
  type Paginated,
  type UpdateVolunteerOpportunityInput,
  type VolunteerOpportunity,
  VolunteerOpportunityStatus,
  type VolunteerOpportunityPublic,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

const DEFAULT_PAGE = 20;
const MAX_PAGE = 100;

/** Clamp a requested page size to [1, MAX_PAGE]. */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE);
}

function toOpportunity(row: OpportunityRow): VolunteerOpportunity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category,
    startDate: row.startDate.toISOString(),
    endDate: row.endDate.toISOString(),
    capacity: row.capacity ?? undefined,
    location: row.location,
    requirements: row.requirements ?? undefined,
    appliesToStudentService: row.appliesToStudentService,
    status: row.status as VolunteerOpportunityStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Raw row from `organization_public(slug)` (T-101) — only `id`/`name` used here. */
interface RawPublicOrg {
  id: string;
  name: string;
}

/**
 * Volunteer opportunities (RF18 · M08). Owner/Administrator publish/edit;
 * view internally = write roles + ReadOnlyAuditor. The PUBLIC listing (no
 * session) resolves an org's slug via the EXISTING `organization_public`
 * SECURITY DEFINER function (T-101), then reads through `withOrgContext` —
 * same technique `PublicCampaignsService.listByOrgSlug` already uses (S2-07).
 */
@Injectable()
export class VolunteerOpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  async create(input: CreateVolunteerOpportunityInput): Promise<VolunteerOpportunity> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.volunteerOpportunity.create({
        data: {
          organizationId,
          title: input.title,
          description: input.description,
          category: input.category,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          capacity: input.capacity,
          location: input.location,
          requirements: input.requirements,
          appliesToStudentService: input.appliesToStudentService ?? false,
        },
      });
      return toOpportunity(row);
    });
  }

  async update(id: string, input: UpdateVolunteerOpportunityInput): Promise<VolunteerOpportunity> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.volunteerOpportunity.findUnique({ where: { id } });
      if (!existing || existing.organizationId !== organizationId) {
        throw new NotFoundException('Volunteer opportunity not found');
      }
      const row = await tx.volunteerOpportunity.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          capacity: input.capacity,
          location: input.location,
          requirements: input.requirements,
          status: input.status,
        },
      });
      return toOpportunity(row);
    });
  }

  async list(limit: number, offset: number): Promise<Paginated<VolunteerOpportunity>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = { organizationId };
      const [rows, total] = await Promise.all([
        tx.volunteerOpportunity.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
        tx.volunteerOpportunity.count({ where }),
      ]);
      return { items: rows.map(toOpportunity), total, limit: take, offset: skip };
    });
  }

  async get(id: string): Promise<VolunteerOpportunity> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.volunteerOpportunity.findUnique({ where: { id } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Volunteer opportunity not found');
    }
    return toOpportunity(row);
  }

  /** PUBLIC (no session): active opportunities of ONE org, by its portal slug. */
  async listPublicByOrgSlug(
    slug: string,
    limit: number,
    offset: number,
  ): Promise<Paginated<VolunteerOpportunityPublic> | null> {
    const orgRows = await this.prisma.$queryRaw<Array<{ data: RawPublicOrg | null }>>(
      Prisma.sql`SELECT organization_public(${slug}) AS data`,
    );
    const org = orgRows[0]?.data;
    if (!org) {
      return null;
    }
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(org.id, async (tx) => {
      const where = { organizationId: org.id, status: VolunteerOpportunityStatus.Active };
      const [rows, total] = await Promise.all([
        tx.volunteerOpportunity.findMany({ where, orderBy: { startDate: 'asc' }, take, skip }),
        tx.volunteerOpportunity.count({ where }),
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          organizationName: org.name,
          title: row.title,
          description: row.description ?? undefined,
          category: row.category,
          startDate: row.startDate.toISOString(),
          endDate: row.endDate.toISOString(),
          capacity: row.capacity ?? undefined,
          location: row.location,
          requirements: row.requirements ?? undefined,
          appliesToStudentService: row.appliesToStudentService,
        })),
        total,
        limit: take,
        offset: skip,
      };
    });
  }

  /** PUBLIC (no session): active opportunities across ALL organizations —
   *  the global feed, same pattern as `public_campaigns`/`public_animals`. */
  async listPublic(limit: number, offset: number): Promise<Paginated<VolunteerOpportunityPublic>> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: VolunteerOpportunityPublic[]; total: number } }>
    >(Prisma.sql`SELECT public_volunteer_opportunities(${take}::int, ${skip}::int) AS data`);
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return { items: data.items ?? [], total: data.total ?? 0, limit: take, offset: skip };
  }
}
