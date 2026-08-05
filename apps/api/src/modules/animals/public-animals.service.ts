import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AnimalSex,
  AnimalSize,
  AnimalSpecies,
  AnimalStatus,
  AnimalSummary,
  AnimalSummaryPage,
  PublicAnimalOrganizationSummary,
  PublicAnimalsPage,
  PublicAnimalSummary,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { computeAge } from './animal-age';
import type { PublicAnimalsGlobalQuery, PublicAnimalsQuery } from './public-animals.schemas';

/** Raw item shape emitted by the SECURITY DEFINER function (public-safe only). */
interface RawItem {
  id: string;
  organizationId: string;
  name: string;
  species: AnimalSpecies;
  sex: AnimalSex;
  size: AnimalSize;
  status: AnimalStatus;
  breed: string | null;
  primaryPhotoRef: string | null;
  birthDate: string | null;
  approximateAgeMonths: number | null;
}

interface RawPage {
  items: RawItem[];
  total: number | string;
  limit: number;
  offset: number;
}

/**
 * Public adoption catalog (T-029). No tenant context (anonymous visitor): reads
 * go through the bounded SECURITY DEFINER function `public_org_adoptable_animals`,
 * which returns ONLY public AnimalSummary columns for adoptable animals. The
 * service DERIVES `computedAge` from the raw age inputs (never surfacing a raw
 * DOB) and resolves `photoUrl` from the primary photo ref — no clinical/internal
 * data is ever touched.
 */
@Injectable()
export class PublicAnimalsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /** Returns the paginated adoptable catalog, or null when the slug resolves to
   *  no public organization (→ 404 at the controller). */
  async listAdoptable(slug: string, query: PublicAnimalsQuery): Promise<AnimalSummaryPage | null> {
    const limit = query.limit ?? null;
    const offset = query.offset ?? null;
    const species = query.species ?? null;

    const rows = await this.prisma.$queryRaw<Array<{ data: RawPage | null }>>(
      Prisma.sql`SELECT public_org_adoptable_animals(${slug}, ${limit}::int, ${offset}::int, ${species}::text) AS data`,
    );
    const page = rows[0]?.data;
    if (!page) {
      return null;
    }

    const now = new Date();
    return {
      items: page.items.map((item) => this.toSummary(item, now)),
      total: Number(page.total),
      limit: page.limit,
      offset: page.offset,
    };
  }

  /**
   * The GLOBAL adoptable catalog across EVERY organization with a public
   * profile (S1-07), for the public landing page.
   *
   * RLS note (no migrations allowed for this task): there is no existing
   * cross-org SECURITY DEFINER function that returns organization_profiles
   * fields (slug/logoUrl/city) for MORE than one org at a time — every public
   * cross-tenant read in this codebase (`organization_public`,
   * `public_org_adoptable_animals`, `public_campaigns`...) is SLUG- or
   * ID-scoped, and adding a new one requires a migration. Instead this method:
   *   1. Reads `organizations` (the tenant anchor — NOT RLS-protected) to get
   *      every organization id, then reads each one's profile inside its own
   *      `withOrgContext` transaction (the same explicit-org accessor
   *      seeds/jobs already use) to find which ones have a public slug.
   *   2. Calls the EXISTING `public_org_adoptable_animals` SECURITY DEFINER
   *      function once per public org (capped at `PER_ORG_CAP` items each),
   *      and merges + paginates the results in memory.
   *
   * Cost is O(organizations on the platform) per request, not O(animals) —
   * fine at pilot scale (a handful of real rescue orgs), but NOT how this
   * should work once the platform has many orgs: that needs a proper
   * cross-tenant SECURITY DEFINER function (a follow-up task, since it
   * requires a migration this one cannot make).
   */
  async listAllAdoptable(query: PublicAnimalsGlobalQuery): Promise<PublicAnimalsPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);

    let directory = await this.getPublicOrgDirectory();
    if (query.city) {
      const needle = query.city.trim().toLowerCase();
      directory = directory.filter((org) => org.city?.toLowerCase() === needle);
    }

    const now = new Date();
    const perOrg = await Promise.all(
      directory.map((org) =>
        this.prisma.$queryRaw<Array<{ data: RawPage | null }>>(
          Prisma.sql`SELECT public_org_adoptable_animals(${org.slug}, ${PublicAnimalsService.PER_ORG_CAP}::int, 0::int, ${query.species ?? null}::text) AS data`,
        ),
      ),
    );

    const allItems: PublicAnimalSummary[] = [];
    perOrg.forEach((rows, i) => {
      const org = directory[i];
      const orgPage = rows[0]?.data;
      if (!orgPage) return;
      for (const item of orgPage.items) {
        allItems.push({ ...this.toSummary(item, now), organization: org });
      }
    });

    const start = (page - 1) * limit;
    return {
      data: allItems.slice(start, start + limit),
      total: allItems.length,
      page,
      limit,
    };
  }

  /** Server cap per organization for the global catalog fan-out (see
   *  {@link listAllAdoptable}'s RLS note) — matches the per-org endpoint's max. */
  private static readonly PER_ORG_CAP = 50;

  /** Every organization with a public profile (slug set), with just the
   *  public-safe fields the global catalog needs. */
  private async getPublicOrgDirectory(): Promise<PublicAnimalOrganizationSummary[]> {
    const organizations = await this.prisma.organization.findMany({
      select: { id: true, name: true },
    });
    const profiles = await Promise.all(
      organizations.map((org) =>
        this.prisma.withOrgContext(org.id, (tx) =>
          tx.organizationProfile.findUnique({ where: { organizationId: org.id } }),
        ),
      ),
    );

    const directory: PublicAnimalOrganizationSummary[] = [];
    organizations.forEach((org, i) => {
      const profile = profiles[i];
      if (!profile?.slug) return;
      const location = profile.location as { city?: string } | null;
      directory.push({
        id: org.id,
        name: org.name,
        slug: profile.slug,
        logoUrl: profile.logoUrl ?? undefined,
        city: location?.city ?? undefined,
      });
    });
    return directory;
  }

  private toSummary(item: RawItem, now: Date): AnimalSummary {
    const birthDate = item.birthDate ? new Date(item.birthDate) : null;
    return {
      id: item.id,
      organizationId: item.organizationId,
      name: item.name,
      species: item.species,
      sex: item.sex,
      size: item.size,
      status: item.status,
      breed: item.breed ?? undefined,
      computedAge: computeAge(birthDate, item.approximateAgeMonths, now),
      primaryPhotoRef: item.primaryPhotoRef ?? undefined,
      photoUrl: item.primaryPhotoRef
        ? this.storage.resolvePublicUrl(item.primaryPhotoRef)
        : undefined,
      isActive: true,
    };
  }
}
