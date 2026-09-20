import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type OrganizationDepartmentCount,
  type OrganizationsGrowth,
  type OrganizationVerificationLevelCount,
  type PlatformSuperAdminDashboardSummary,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

interface FinancialRow {
  gross_total: string;
  platform_fee_total: string;
  gateway_fee_total: string;
  net_total: string;
}

interface BusinessCountsRow {
  active_animals: number;
  total_adoptions: number;
  active_campaigns: number;
  active_sponsorships: number;
}

interface GrowthRow {
  current_period_count: number;
  previous_period_count: number;
}

/**
 * RF28 — tasa de crecimiento mensual de organizaciones registradas.
 * `growthRatePct = ((current - previous) / previous) * 100`, salvo
 * `previousPeriodCount === 0`: entonces es `0` (sin registros en ningún
 * período, no hay división por cero) o `100` (hubo registros nuevos "desde
 * cero" — convención explícita, nunca `Infinity`/`NaN`). Exportada para
 * poder probarla de forma aislada (sin mockear Prisma) en el spec unitario.
 */
export function computeOrganizationsGrowth(
  currentPeriodCount: number,
  previousPeriodCount: number,
): OrganizationsGrowth {
  const growthRatePct =
    previousPeriodCount === 0
      ? currentPeriodCount === 0
        ? 0
        : 100
      : ((currentPeriodCount - previousPeriodCount) / previousPeriodCount) * 100;
  return { currentPeriodCount, previousPeriodCount, growthRatePct };
}

/**
 * M13 (RF24, S-8) — PlatformSuperAdmin ONLY (never PlatformAdmin, gated at
 * the controller). Reads four cross-tenant SECURITY DEFINER functions added
 * in this spec's migration (`platform_financial_summary`,
 * `platform_business_counts`, `platform_organizations_by_verification_level`,
 * `platform_organizations_by_department`) — each SUMS/COUNTS data already
 * computed elsewhere (donation `breakdown` from M15's `computeBreakdown()`,
 * the same "active"/"terminal" status filters each module already uses).
 * Nothing here recomputes a formula.
 *
 * RF28 growth indicator (S-9): a fifth cross-tenant function,
 * `platform_organizations_growth()` (migration
 * `20260918000000_s9_platform_organizations_growth`), counts
 * `organizations.created_at` in the last 30 days vs. the 30 days before that
 * — the only derived math is `computeOrganizationsGrowth()` below, which
 * turns those two real counts into a % (see its own doc comment for the
 * zero-division convention).
 */
@Injectable()
export class PlatformSuperAdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<PlatformSuperAdminDashboardSummary> {
    const [financialRows, countsRows, verificationRows, departmentRows, growthRows] =
      await Promise.all([
        this.prisma.$queryRaw<FinancialRow[]>(
          Prisma.sql`SELECT * FROM platform_financial_summary()`,
        ),
        this.prisma.$queryRaw<BusinessCountsRow[]>(
          Prisma.sql`SELECT * FROM platform_business_counts()`,
        ),
        this.prisma.$queryRaw<Array<{ data: OrganizationVerificationLevelCount[] }>>(
          Prisma.sql`SELECT platform_organizations_by_verification_level() AS data`,
        ),
        this.prisma.$queryRaw<Array<{ data: OrganizationDepartmentCount[] }>>(
          Prisma.sql`SELECT platform_organizations_by_department() AS data`,
        ),
        this.prisma.$queryRaw<GrowthRow[]>(
          Prisma.sql`SELECT * FROM platform_organizations_growth()`,
        ),
      ]);

    const financial = financialRows[0];
    const counts = countsRows[0];
    const growth = growthRows[0];

    return {
      grossTotal: Number(financial?.gross_total ?? 0),
      platformFeeTotal: Number(financial?.platform_fee_total ?? 0),
      gatewayFeeTotal: Number(financial?.gateway_fee_total ?? 0),
      netTotal: Number(financial?.net_total ?? 0),
      organizationsByVerificationLevel: verificationRows[0]?.data ?? [],
      activeAnimals: counts?.active_animals ?? 0,
      totalAdoptions: counts?.total_adoptions ?? 0,
      activeCampaigns: counts?.active_campaigns ?? 0,
      activeSponsorships: counts?.active_sponsorships ?? 0,
      organizationsByDepartment: departmentRows[0]?.data ?? [],
      organizationsGrowth: computeOrganizationsGrowth(
        growth?.current_period_count ?? 0,
        growth?.previous_period_count ?? 0,
      ),
    };
  }
}
