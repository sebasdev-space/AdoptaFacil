import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CampaignFundingReconcileResult, CampaignFundingResult } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

/** Row returned by apply_campaign_funding (only when newly counted). */
interface AppliedRow {
  organization_id: string;
  campaign_id: string;
  net: number;
}

/** Row returned by reconcile_org_campaign_funding (one per newly counted collection). */
interface ReconciledRow {
  organization_id: string;
  campaign_id: string;
  collection_id: string;
  net: number;
}

/**
 * Real campaign funding (RF15 · T-055). Turns APPROVED campaign-attributed
 * donations into real `raisedAmount`, EXACTLY ONCE per collection. The money math
 * is NOT recomputed here — the donation already stored `breakdown.net`
 * (computeBreakdown, the single source); the SECURITY DEFINER functions just add
 * that net under the idempotency ledger. progress stays DERIVED in the API.
 *
 * Two entry points, same ledger (idempotent):
 *  - {@link applyApprovedCollection} — per collection, for the donations webhook
 *    (which runs WITHOUT a tenant context); the DEFINER function resolves the org
 *    and writes without evading RLS (same pattern as the T-106 worker). This is
 *    the HANDOFF point for @fabian to call from `applyDonationWebhook`.
 *  - {@link reconcileMyOrg} — authenticated self-service catch-up for an org.
 *
 * Every newly-applied collection is audited (UTC) with NO payer data (Ley 1581).
 */
@Injectable()
export class CampaignFundingService {
  private readonly logger = new Logger('CampaignFunding');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Apply ONE approved campaign collection to its campaign's raised amount. A
   * no-op (returns `{ applied: false }`) when the collection is unknown, not a
   * campaign donation, not approved, the campaign is not active, or it was already
   * counted — so a repeated webhook never double-counts.
   */
  async applyApprovedCollection(collectionId: string): Promise<CampaignFundingResult> {
    const rows = await this.prisma.$queryRaw<AppliedRow[]>(
      Prisma.sql`SELECT * FROM apply_campaign_funding(${collectionId})`,
    );
    const applied = rows[0];
    if (!applied) {
      return { applied: false };
    }
    await this.auditApplied(
      applied.organization_id,
      applied.campaign_id,
      collectionId,
      applied.net,
    );
    return { applied: true, campaignId: applied.campaign_id, net: applied.net };
  }

  /**
   * Reconcile the CALLER org's approved campaign donations into raised (idempotent
   * catch-up). Audits each newly-applied collection. Runs bounded to the caller's
   * own tenant.
   */
  async reconcileMyOrg(): Promise<CampaignFundingReconcileResult> {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    const rows = await this.prisma.$queryRaw<ReconciledRow[]>(
      Prisma.sql`SELECT * FROM reconcile_org_campaign_funding(${organizationId}::uuid)`,
    );
    let totalNet = 0;
    for (const r of rows) {
      await this.auditApplied(r.organization_id, r.campaign_id, r.collection_id, r.net);
      totalNet += r.net;
    }
    return { applied: rows.length, totalNet };
  }

  /** Append-only audit of a counted collection (UTC); NEVER any payer data. */
  private async auditApplied(
    organizationId: string,
    campaignId: string,
    collectionId: string,
    net: number,
  ): Promise<void> {
    await this.audit.record({
      organizationId,
      actorUserId: null,
      action: 'campaign.funding_applied',
      entityType: 'campaign',
      entityId: campaignId,
      metadata: { collectionId, net },
    });
    this.logger.log(`campaign funding applied campaign=${campaignId} net=${net}`);
  }
}
