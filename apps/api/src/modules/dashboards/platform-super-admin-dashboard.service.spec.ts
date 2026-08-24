import type { PrismaService } from '../../prisma/prisma.service';
import { PlatformSuperAdminDashboardService } from './platform-super-admin-dashboard.service';

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
      .mockResolvedValueOnce([{ data: [{ department: 'Antioquia', count: 4 }] }]);

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
      .mockResolvedValueOnce([{ data: [] }]);

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
    });
  });
});
