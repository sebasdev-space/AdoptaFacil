import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  SponsorshipPeriodicity,
  SponsorshipPlanPublic,
  SponsorshipPublicSummary,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/** Raw plan row emitted by the public_animal_sponsorship_summary function. */
interface RawPublicPlan {
  id: string;
  animalId: string;
  name: string;
  amount: number;
  periodicity: string;
}

/** Raw payload from public_animal_sponsorship_summary. */
interface RawSummary {
  animalId: string;
  activePlans: RawPublicPlan[] | null;
  activeSponsorCount: number | string | null;
}

/**
 * PUBLIC (no-session) sponsorship summary for an animal (RF17, optional/aditivo).
 * Cross-tenant exposure goes through the bounded SECURITY DEFINER function
 * `public_animal_sponsorship_summary` — never a raw RLS-evading select — so only
 * public plan columns and a sponsor COUNT (never sponsor identities) leave the DB.
 */
@Injectable()
export class PublicSponsorshipsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnimalSummary(animalId: string): Promise<SponsorshipPublicSummary> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawSummary }>>(
      Prisma.sql`SELECT public_animal_sponsorship_summary(${animalId}::uuid) AS data`,
    );
    const data = rows[0]?.data ?? { animalId, activePlans: [], activeSponsorCount: 0 };
    const activePlans: SponsorshipPlanPublic[] = (data.activePlans ?? []).map((p) => ({
      id: p.id,
      animalId: p.animalId,
      name: p.name,
      amount: p.amount,
      periodicity: p.periodicity as SponsorshipPeriodicity,
    }));
    return {
      animalId,
      activePlans,
      activeSponsorCount: Number(data.activeSponsorCount ?? 0),
    };
  }
}
