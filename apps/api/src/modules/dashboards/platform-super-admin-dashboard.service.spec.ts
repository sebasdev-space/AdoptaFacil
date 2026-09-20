import type { PrismaService } from '../../prisma/prisma.service';
import {
  computeOrganizationsGrowth,
  PlatformSuperAdminDashboardService,
} from './platform-super-admin-dashboard.service';

interface Harness {
  service: PlatformSuperAdminDashboardService;
  queryRaw: jest.Mock;
}

function makeService(): Harness {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  return { service: new PlatformSuperAdminDashboardService(prisma), queryRaw };
}

describe('PlatformSuperAdminDashboardService.getSummary (RF24)', () => {
  it('sums the already-computed breakdown fields and folds IVA into each commission bucket', async () => {
    const h = makeService();
    h.queryRaw
      .mockResolvedValueOnce([
        {
          gross_total: '1000000',
          platform_fee_total: '47600', // 40000 fee + 7600 IVA (19%)
          gateway_fee_total: '29988.5',
          net_total: '922411.5',
        },
      ])
      .mockResolvedValueOnce([
        { active_animals: 12, total_adoptions: 4, active_campaigns: 2, active_sponsorships: 6 },
      ])
      .mockResolvedValueOnce([
        {
          data: [
            { level: 0, count: 3 },
            { level: 2, count: 5 },
          ],
        },
      ])
      .mockResolvedValueOnce([{ data: [{ department: 'Antioquia', count: 4 }] }])
      .mockResolvedValueOnce([{ current_period_count: 6, previous_period_count: 4 }]);

    const summary = await h.service.getSummary();

    expect(summary).toEqual({
      grossTotal: 1000000,
      platformFeeTotal: 47600,
      gatewayFeeTotal: 29988.5,
      netTotal: 922411.5,
      organizationsByVerificationLevel: [
        { level: 0, count: 3 },
        { level: 2, count: 5 },
      ],
      activeAnimals: 12,
      totalAdoptions: 4,
      activeCampaigns: 2,
      activeSponsorships: 6,
      organizationsByDepartment: [{ department: 'Antioquia', count: 4 }],
      organizationsGrowth: { currentPeriodCount: 6, previousPeriodCount: 4, growthRatePct: 50 },
    });
    // gross === platformFee + gatewayFee + net (same identity computeBreakdown
    // guarantees per-donation) must still hold once summed at platform scale.
    expect(summary.platformFeeTotal + summary.gatewayFeeTotal + summary.netTotal).toBeCloseTo(
      summary.grossTotal,
      6,
    );
  });

  it('defaults every field to 0/[] when there is no data yet (fresh platform)', async () => {
    const h = makeService();
    h.queryRaw
      .mockResolvedValueOnce([
        { gross_total: '0', platform_fee_total: '0', gateway_fee_total: '0', net_total: '0' },
      ])
      .mockResolvedValueOnce([
        { active_animals: 0, total_adoptions: 0, active_campaigns: 0, active_sponsorships: 0 },
      ])
      .mockResolvedValueOnce([{ data: [] }])
      .mockResolvedValueOnce([{ data: [] }])
      .mockResolvedValueOnce([{ current_period_count: 0, previous_period_count: 0 }]);

    const summary = await h.service.getSummary();

    expect(summary).toEqual({
      grossTotal: 0,
      platformFeeTotal: 0,
      gatewayFeeTotal: 0,
      netTotal: 0,
      organizationsByVerificationLevel: [],
      activeAnimals: 0,
      totalAdoptions: 0,
      activeCampaigns: 0,
      activeSponsorships: 0,
      organizationsByDepartment: [],
      organizationsGrowth: { currentPeriodCount: 0, previousPeriodCount: 0, growthRatePct: 0 },
    });
  });
});

describe('computeOrganizationsGrowth (RF28)', () => {
  it('computes a positive growth rate when the current period grew', () => {
    expect(computeOrganizationsGrowth(15, 10)).toEqual({
      currentPeriodCount: 15,
      previousPeriodCount: 10,
      growthRatePct: 50,
    });
  });

  it('computes a negative growth rate when the current period shrank', () => {
    expect(computeOrganizationsGrowth(5, 10)).toEqual({
      currentPeriodCount: 5,
      previousPeriodCount: 10,
      growthRatePct: -50,
    });
  });

  it('returns 0% (no division by zero) when both periods have zero organizations', () => {
    expect(computeOrganizationsGrowth(0, 0)).toEqual({
      currentPeriodCount: 0,
      previousPeriodCount: 0,
      growthRatePct: 0,
    });
  });

  it('returns 100% (never Infinity/NaN) when the previous period was zero but the current period is not', () => {
    expect(computeOrganizationsGrowth(3, 0)).toEqual({
      currentPeriodCount: 3,
      previousPeriodCount: 0,
      growthRatePct: 100,
    });
  });
});
