import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type OrganizationDepartmentCount,
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

/**
 * M13 (RF24, S-8) — PlatformSuperAdmin ONLY (never PlatformAdmin, gated at
 * the controller). Reads four cross-tenant SECURITY DEFINER functions added
 * in this spec's migration (`platform_financial_summary`,
 * `platform_business_counts`, `platform_organizations_by_verification_level`,
 * `platform_organizations_by_department`) — each SUMS/COUNTS data already
 * computed elsewhere (donation `breakdown` from M15's `computeBreakdown()`,
 * the same "active"/"terminal" status filters each module already uses).
 * Nothing here recomputes a formula.
 */
@Injectable()
export class PlatformSuperAdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<PlatformSuperAdminDashboardSummary> {
    const [financialRows, countsRows, verificationRows, departmentRows] = await Promise.all([
      this.prisma.$queryRaw<FinancialRow[]>(Prisma.sql`SELECT * FROM platform_financial_summary()`),
      this.prisma.$queryRaw<BusinessCountsRow[]>(
        Prisma.sql`SELECT * FROM platform_business_counts()`,
      ),
      this.prisma.$queryRaw<Array<{ data: OrganizationVerificationLevelCount[] }>>(
        Prisma.sql`SELECT platform_organizations_by_verification_level() AS data`,
      ),
      this.prisma.$queryRaw<Array<{ data: OrganizationDepartmentCount[] }>>(
        Prisma.sql`SELECT platform_organizations_by_department() AS data`,
      ),
    ]);

    const financial = financialRows[0];
    const counts = countsRows[0];

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
    };
  }
}
