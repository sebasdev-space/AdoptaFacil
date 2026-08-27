import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BILLING_FAILURE_SUSPENSION_REASON, SponsorshipStatus } from '@adoptafacil/contracts';
import type { PaymentPort } from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PAYMENT_PORT } from '../../core/payments/payment.port';
import { PrismaService } from '../../prisma/prisma.service';
import { SponsorshipsService } from './sponsorships.service';

/** Row from `sponsorship_pending_payment_attempts()` (snake_case, raw SQL). */
interface PendingAttemptRow {
  attempt_id: string;
  organization_id: string;
  sponsorship_payment_id: string;
  collection_id: string;
}

/**
 * Payment CONFIRMATION for the recurring-billing ledger (S-5-REDISEÑO, M07/
 * RF17, T-057) — by POLLING `PaymentPort.getCollectionStatus()`, not the
 * gateway webhook. The single webhook Wompi calls is already wired inside
 * `donations/**` with a hardcoded `if (concept_kind === 'campaign')` branch
 * (Fabián's domain) — extending it for `'sponsorship'` would mean editing
 * that module, out of scope for this task (confirmed with the user,
 * 2026-08-24). This poller runs frequently (see
 * `SPONSORSHIP_PAYMENT_POLL_INTERVAL_MS`) so confirmation stays close to
 * real time without that cross-domain change — still "consume PaymentPort,
 * read-only/call, no changes to its code" per this task's own Cruce.
 *
 * On `approved`: the attempt + its period are marked `paid` immediately, any
 * remaining ladder for that period stops (it is no longer `pending`, so the
 * daily scan's `sponsorship_open_payment_periods()` no longer returns it),
 * and — if the sponsorship had been auto-suspended for billing failure — it
 * is REACTIVATED automatically (Objetivo 6), unlike a manual suspension by
 * the organization, which still needs a manual reactivation on their side.
 */
@Injectable()
export class SponsorshipPaymentPollerService {
  private readonly logger = new Logger(SponsorshipPaymentPollerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sponsorships: SponsorshipsService,
    @Inject(PAYMENT_PORT) private readonly payments: PaymentPort,
  ) {}

  async pollPending(): Promise<void> {
    const rows = await this.prisma.$queryRaw<PendingAttemptRow[]>(
      Prisma.sql`SELECT * FROM sponsorship_pending_payment_attempts()`,
    );
    for (const row of rows) {
      await this.pollOne(row);
    }
  }

  private async pollOne(row: PendingAttemptRow): Promise<void> {
    let status: string;
    try {
      status = await this.payments.getCollectionStatus(row.collection_id);
    } catch (error) {
      this.logger.warn(
        `getCollectionStatus failed for ${row.collection_id}: ${(error as Error).message}`,
      );
      return;
    }
    if (status !== 'approved') {
      return; // still pending/declined — the ladder handles expiry, not this poller
    }

    await this.prisma.withOrgContext(row.organization_id, async (tx) => {
      const attempt = await tx.sponsorshipPaymentAttempt.findUnique({
        where: { id: row.attempt_id },
      });
      if (!attempt || attempt.result !== 'pending') {
        return; // already resolved by a previous poll run (idempotent)
      }
      await tx.sponsorshipPaymentAttempt.update({
        where: { id: row.attempt_id },
        data: { result: 'paid' },
      });
      const payment = await tx.sponsorshipPayment.update({
        where: { id: row.sponsorship_payment_id },
        data: { status: 'paid', paidAt: new Date() },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: row.organization_id,
        actorUserId: null,
        action: 'sponsorship.billing_payment_confirmed',
        entityType: 'sponsorship_payment',
        entityId: payment.id,
        metadata: { attemptId: row.attempt_id },
      });

      const sponsorship = await tx.sponsorship.findUnique({
        where: { id: payment.sponsorshipId },
      });
      if (sponsorship?.status === SponsorshipStatus.Suspended) {
        // Only auto-reactivate a BILLING-failure suspension — a manual
        // suspension by the organization still needs manual reactivation.
        const lastSuspension = await tx.sponsorshipStatusHistory.findFirst({
          where: { sponsorshipId: sponsorship.id, toStatus: SponsorshipStatus.Suspended },
          orderBy: { createdAt: 'desc' },
        });
        if (lastSuspension?.reason === BILLING_FAILURE_SUSPENSION_REASON) {
          await this.sponsorships.applySystemTransition(
            tx,
            row.organization_id,
            sponsorship.id,
            SponsorshipStatus.Active,
            'Pago confirmado tras suspensión automática por impago.',
          );
        }
      }
    });
  }
}
