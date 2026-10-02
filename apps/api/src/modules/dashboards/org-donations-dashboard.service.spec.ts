import { Role } from '@adoptafacil/contracts';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { RbacService } from '../../core/rbac/rbac.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { OrgDonationsDashboardService } from './org-donations-dashboard.service';

const actor = { id: 'user-1' } as RequestUser;

interface TxStub {
  donation: { groupBy: jest.Mock; findMany: jest.Mock };
  campaign: { findMany: jest.Mock };
  sponsorship: { findMany: jest.Mock };
}

function makeTx(overrides: Partial<TxStub> = {}): TxStub {
  return {
    donation: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides.donation,
    },
    campaign: { findMany: jest.fn().mockResolvedValue([]), ...overrides.campaign },
    sponsorship: { findMany: jest.fn().mockResolvedValue([]), ...overrides.sponsorship },
  };
}

function makeService(roles: Role[], tx: TxStub) {
  const tenant = { getOrganizationId: () => 'org-1' } as unknown as TenantContextService;
  const prisma = {
    withOrgContext: jest.fn().mockImplementation((_org, fn) => fn(tx)),
  } as unknown as PrismaService;
  const rbac = { rolesForUser: jest.fn().mockResolvedValue(roles) } as unknown as RbacService;
  return { service: new OrgDonationsDashboardService(prisma, tenant, rbac), prisma, rbac };
}

describe('OrgDonationsDashboardService.getSummary (M13, S-14)', () => {
  it('Owner sees all three sections', async () => {
    const tx = makeTx({
      donation: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'pending', _count: { _all: 2 } },
          { status: 'approved', _count: { _all: 5 } },
          { status: 'declined', _count: { _all: 1 } },
        ]),
        findMany: jest
          .fn()
          .mockResolvedValue([{ breakdown: { net: 10000 } }, { breakdown: { net: 5000 } }]),
      },
      campaign: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'camp-1',
            title: 'Cirugías de emergencia',
            status: 'active',
            goalAmount: 1000000,
            raisedAmount: 250000,
            deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          },
        ]),
      },
      sponsorship: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'active', payments: [{ status: 'failed' }] },
          { status: 'active', payments: [{ status: 'paid' }] },
          { status: 'suspended', payments: [] },
          { status: 'cancelled', payments: [] },
        ]),
      },
    });
    const { service } = makeService([Role.Owner], tx);

    const summary = await service.getSummary(actor);

    expect(summary.donations).toEqual({
      pending: 2,
      approved: 5,
      declined: 1,
      netReceivedTotal: 15000,
    });
    expect(summary.campaigns).toEqual([
      expect.objectContaining({
        id: 'camp-1',
        progress: 0.25,
        endingSoon: true,
      }),
    ]);
    expect(summary.sponsorships).toEqual({
      active: 2,
      suspended: 1,
      cancelled: 1,
      atPaymentRisk: 1,
    });
  });

  it('Operator sees donations + campaigns, but NOT sponsorships (no Operator in SPONSORSHIPS_VIEW_ROLES)', async () => {
    const tx = makeTx();
    const { service } = makeService([Role.Operator], tx);

    const summary = await service.getSummary(actor);

    expect(summary.donations).toBeDefined();
    expect(summary.campaigns).toBeDefined();
    expect(summary.sponsorships).toBeUndefined();
    expect(tx.sponsorship.findMany).not.toHaveBeenCalled();
  });

  it('ReadOnlyAuditor sees campaigns + sponsorships, but NOT donations (no auditor in DONATIONS_VIEW_ROLES)', async () => {
    const tx = makeTx();
    const { service } = makeService([Role.ReadOnlyAuditor], tx);

    const summary = await service.getSummary(actor);

    expect(summary.donations).toBeUndefined();
    expect(summary.campaigns).toBeDefined();
    expect(summary.sponsorships).toBeDefined();
    expect(tx.donation.groupBy).not.toHaveBeenCalled();
  });

  it('a role with no dashboard section at all (Volunteer) gets every section undefined', async () => {
    const tx = makeTx();
    const { service } = makeService([Role.Volunteer], tx);

    const summary = await service.getSummary(actor);

    expect(summary).toEqual({
      donations: undefined,
      campaigns: undefined,
      sponsorships: undefined,
    });
  });

  it('a campaign past its deadline is never "endingSoon", even if still status=active', async () => {
    const tx = makeTx({
      campaign: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'camp-expired',
            title: 'Campaña vencida',
            status: 'active',
            goalAmount: 100,
            raisedAmount: 50,
            deadline: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        ]),
      },
    });
    const { service } = makeService([Role.Owner], tx);

    const summary = await service.getSummary(actor);

    expect(summary.campaigns).toEqual([expect.objectContaining({ endingSoon: false })]);
  });

  it('a closed campaign is never "endingSoon" even with a near deadline', async () => {
    const tx = makeTx({
      campaign: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'camp-closed',
            title: 'Campaña cerrada',
            status: 'closed',
            goalAmount: 100,
            raisedAmount: 100,
            deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        ]),
      },
    });
    const { service } = makeService([Role.Owner], tx);

    const summary = await service.getSummary(actor);

    expect(summary.campaigns).toEqual([expect.objectContaining({ endingSoon: false })]);
  });

  it('only the LATEST payment period decides payment risk, never an older one', async () => {
    const tx = makeTx({
      sponsorship: {
        // Prisma already returns `take: 1` ordered desc — this mock simulates
        // that the query layer only ever hands the service the latest row.
        findMany: jest
          .fn()
          .mockResolvedValue([{ status: 'active', payments: [{ status: 'paid' }] }]),
      },
    });
    const { service } = makeService([Role.Owner], tx);

    const summary = await service.getSummary(actor);

    expect(summary.sponsorships).toEqual({
      active: 1,
      suspended: 0,
      cancelled: 0,
      atPaymentRisk: 0,
    });
  });
});
