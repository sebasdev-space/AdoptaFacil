import { ForbiddenException } from '@nestjs/common';
import type { AuditService } from '../../core/audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContextService } from '../../core/tenant/tenant-context.service';
import { CampaignFundingService } from './campaign-funding.service';

interface Harness {
  service: CampaignFundingService;
  queryRaw: jest.Mock;
  record: jest.Mock;
  getOrganizationId: jest.Mock;
}

function makeService(): Harness {
  const queryRaw = jest.fn();
  const record = jest.fn().mockResolvedValue({});
  const getOrganizationId = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const tenant = { getOrganizationId } as unknown as TenantContextService;
  const audit = { record } as unknown as AuditService;
  return {
    service: new CampaignFundingService(prisma, tenant, audit),
    queryRaw,
    record,
    getOrganizationId,
  };
}

describe('CampaignFundingService.applyApprovedCollection (T-055)', () => {
  it('applies once and audits the net when the collection is newly counted', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([
      { organization_id: 'org-1', campaign_id: 'camp-1', net: 95_000 },
    ]);

    const result = await h.service.applyApprovedCollection('fake-col-1');

    expect(result).toEqual({ applied: true, campaignId: 'camp-1', net: 95_000 });
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        actorUserId: null,
        action: 'campaign.funding_applied',
        entityType: 'campaign',
        entityId: 'camp-1',
        metadata: { collectionId: 'fake-col-1', net: 95_000 },
      }),
    );
  });

  it('is a no-op (no audit) when the collection was already counted / not approved', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([]); // function returned 0 rows → idempotent no-op

    const result = await h.service.applyApprovedCollection('fake-col-1');

    expect(result).toEqual({ applied: false });
    expect(h.record).not.toHaveBeenCalled();
  });
});

describe('CampaignFundingService.reconcileMyOrg (T-055)', () => {
  it('audits each newly-applied collection and sums the nets', async () => {
    const h = makeService();
    h.getOrganizationId.mockReturnValue('org-1');
    h.queryRaw.mockResolvedValueOnce([
      { organization_id: 'org-1', campaign_id: 'c1', collection_id: 'col-1', net: 100 },
      { organization_id: 'org-1', campaign_id: 'c2', collection_id: 'col-2', net: 200 },
    ]);

    const result = await h.service.reconcileMyOrg();

    expect(result).toEqual({ applied: 2, totalNet: 300 });
    expect(h.record).toHaveBeenCalledTimes(2);
  });

  it('rejects when there is no tenant context', async () => {
    const h = makeService();
    h.getOrganizationId.mockReturnValue(undefined);
    await expect(h.service.reconcileMyOrg()).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.queryRaw).not.toHaveBeenCalled();
  });
});
