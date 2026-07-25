import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AnimalSex,
  AnimalSize,
  AnimalSpecies,
  AnimalStatus,
  AnimalSummary,
  AnimalSummaryPage,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { computeAge } from './animal-age';
import type { PublicAnimalsQuery } from './public-animals.schemas';

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
