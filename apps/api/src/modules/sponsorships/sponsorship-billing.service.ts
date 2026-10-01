import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { BILLING_FAILURE_SUSPENSION_REASON, SponsorshipStatus } from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import type { Env } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import {
  addMonths,
  billingPeriod,
  buildAttemptIdempotencyKey,
  elapsedDays,
  type LadderConfig,
  nextLadderAction,
} from './sponsorship-billing';
import {
  buildChargeBody,
  buildChargeSubject,
  buildReminderBody,
  buildReminderSubject,
  buildSuspensionOrgBody,
  buildSuspensionOrgSubject,
  buildSuspensionSponsorBody,
  buildSuspensionSponsorSubject,
} from './sponsorship-notifications';
import { SponsorshipsService } from './sponsorships.service';

/** Row from `sponsorships_due_for_billing()` (snake_case, raw SQL). */
interface DueRow {
  sponsorship_id: string;
  organization_id: string;
  organization_name: string;
  animal_name: string;
  plan_amount: number;
  sponsor_user_id: string;
  sponsor_email: string;
}

/** Row from `sponsorship_open_payment_periods()` (snake_case, raw SQL). */
interface OpenPeriodRow {
  payment_id: string;
  organization_id: string;
  organization_name: string;
  animal_name: string;
  sponsorship_id: string;
  period: string;
  period_started_at: Date;
  attempt_count: number;
  reminders_sent: number;
  plan_amount: number;
  sponsor_user_id: string;
  sponsor_email: string;
}

/**
 * The daily billing scan (S-5-REDISEÑO, M07/RF17, T-057) — the FIRST real
 * cron in this project. Two passes, both idempotent/resumable by
 * construction (never by "did today already run"):
 *   1. Opens a new `SponsorshipPayment` (+ its attempt 1) for every active
 *      sponsorship whose `nextBillingAt` has arrived.
 *   2. Walks the tolerant reminder/retry ladder for every OPEN period,
 *      applying every threshold the elapsed days now cover — this is what
 *      lets the job "catch up" after downtime without duplicating anything.
 * Payment confirmation is a SEPARATE poller (`SponsorshipPaymentPoller`) that
 * calls `PaymentPort.getCollectionStatus()` — see that file's header comment
 * for why (not the gateway webhook).
 */
@Injectable()
export class SponsorshipBillingService {
  private readonly logger = new Logger(SponsorshipBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly sponsorships: SponsorshipsService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
  ) {}

  private ladderConfig(): LadderConfig {
    return {
      reminderDay1: this.config.get('SPONSORSHIP_REMINDER_DAY_1', { infer: true }),
      expireAttempt1Day: this.config.get('SPONSORSHIP_EXPIRE_ATTEMPT_1_DAY', { infer: true }),
      reminderDay2: this.config.get('SPONSORSHIP_REMINDER_DAY_2', { infer: true }),
      expireAttempt2Day: this.config.get('SPONSORSHIP_EXPIRE_ATTEMPT_2_DAY', { infer: true }),
      reminderFinalDay: this.config.get('SPONSORSHIP_REMINDER_FINAL_DAY', { infer: true }),
      expireAttempt3Day: this.config.get('SPONSORSHIP_EXPIRE_ATTEMPT_3_DAY', { infer: true }),
    };
  }

  async runDailyScan(): Promise<void> {
    await this.openDuePeriods();
    await this.advanceOpenPeriods();
  }

  private async openDuePeriods(): Promise<void> {
    const rows = await this.prisma.$queryRaw<DueRow[]>(
      Prisma.sql`SELECT * FROM sponsorships_due_for_billing()`,
    );
    for (const row of rows) {
      // Per-row isolation: one sponsorship's failure (e.g. a DB error) must
      // never abort the scan for every other one (same posture as
      // `MercadoPagoConnectService.refreshDueAccounts`).
      try {
        await this.openPeriodFor(row);
      } catch (error) {
        this.logger.warn(
          `openPeriodFor failed for sponsorship=${row.sponsorship_id}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async openPeriodFor(row: DueRow): Promise<void> {
    const now = new Date();
    const period = billingPeriod(now);

    // Idempotency pre-check (plain read, no side effect yet): a period is
    // opened AT MOST once per (sponsorship, period) — the unique index is the
    // hard backstop, this just avoids a wasted PaymentPort call on a re-run.
    const existing = await this.prisma.withOrgContext(row.organization_id, (tx) =>
      tx.sponsorshipPayment.findUnique({
        where: { sponsorshipId_period: { sponsorshipId: row.sponsorship_id, period } },
      }),
    );
    if (existing) {
      return;
    }

    const attempt = this.buildPlaceholderAttempt(row.sponsorship_id, period, 1);

    await this.prisma.withOrgContext(row.organization_id, async (tx) => {
      const payment = await tx.sponsorshipPayment.create({
        data: {
          organizationId: row.organization_id,
          sponsorshipId: row.sponsorship_id,
          period,
          periodStartedAt: now,
          attemptCount: 1,
        },
      });
      await tx.sponsorshipPaymentAttempt.create({
        data: {
          organizationId: row.organization_id,
          sponsorshipPaymentId: payment.id,
          attemptNumber: 1,
          collectionId: attempt.collectionId,
          paymentLinkUrl: attempt.paymentLinkUrl,
          idempotencyKey: attempt.idempotencyKey,
          expiresAt: addDays(now, this.ladderConfig().expireAttempt1Day),
        },
      });
      await tx.sponsorship.update({
        where: { id: row.sponsorship_id },
        data: { nextBillingAt: addMonths(now, 1) },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: row.organization_id,
        actorUserId: null,
        action: 'sponsorship.billing_period_opened',
        entityType: 'sponsorship_payment',
        entityId: payment.id,
        metadata: { period, attemptNumber: 1 },
      });
    });

    await this.notifyBestEffort(
      row.sponsor_email,
      buildChargeSubject(),
      buildChargeBody({
        organizationName: row.organization_name,
        animalName: row.animal_name,
        amount: row.plan_amount,
      }),
    );
  }

  private async advanceOpenPeriods(): Promise<void> {
    const rows = await this.prisma.$queryRaw<OpenPeriodRow[]>(
      Prisma.sql`SELECT * FROM sponsorship_open_payment_periods()`,
    );
    for (const row of rows) {
      await this.advanceOnePeriod(row);
    }
  }

  /** Walks the ladder for ONE period, applying every threshold that elapsed
   *  days now cover (loop until nothing more is due or the period resolves)
   *  — this is the "catches up after downtime" behavior. */
  private async advanceOnePeriod(row: OpenPeriodRow): Promise<void> {
    const config = this.ladderConfig();
    let state = { attemptCount: row.attempt_count, remindersSent: row.reminders_sent };
    const elapsed = elapsedDays(row.period_started_at, new Date());

    for (let guard = 0; guard < 10; guard += 1) {
      const action = nextLadderAction(state, elapsed, config);
      if (!action) {
        return;
      }

      if (action === 'send_reminder_1' || action === 'send_reminder_2') {
        await this.sendReminder(row, false);
        state = { ...state, remindersSent: state.remindersSent + 1 };
        continue;
      }
      if (action === 'send_reminder_final') {
        await this.sendReminder(row, true);
        state = { ...state, remindersSent: state.remindersSent + 1 };
        continue;
      }
      if (
        action === 'expire_attempt_1_and_create_attempt_2' ||
        action === 'expire_attempt_2_and_create_attempt_3'
      ) {
        const nextAttemptNumber = state.attemptCount + 1;
        await this.expireAndCreateNextAttempt(row, state.attemptCount, nextAttemptNumber, config);
        state = { attemptCount: nextAttemptNumber, remindersSent: state.remindersSent };
        continue;
      }
      if (action === 'expire_attempt_3_and_fail') {
        await this.expireFinalAttemptAndFailPeriod(row, state.attemptCount);
        return; // period is now terminal (failed) — nothing more to walk
      }
    }
  }

  private async sendReminder(row: OpenPeriodRow, isFinal: boolean): Promise<void> {
    await this.prisma.withOrgContext(row.organization_id, async (tx) => {
      const updated = await tx.sponsorshipPayment.update({
        where: { id: row.payment_id },
        data: { remindersSent: { increment: 1 } },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: row.organization_id,
        actorUserId: null,
        action: 'sponsorship.billing_reminder_sent',
        entityType: 'sponsorship_payment',
        entityId: row.payment_id,
        metadata: { remindersSent: updated.remindersSent, isFinal },
      });
    });
    await this.notifyBestEffort(
      row.sponsor_email,
      buildReminderSubject({
        organizationName: row.organization_name,
        animalName: row.animal_name,
        amount: row.plan_amount,
        isFinal,
      }),
      buildReminderBody({
        organizationName: row.organization_name,
        animalName: row.animal_name,
        amount: row.plan_amount,
        isFinal,
      }),
    );
  }

  private async expireAndCreateNextAttempt(
    row: OpenPeriodRow,
    expiringAttemptNumber: number,
    nextAttemptNumber: number,
    config: LadderConfig,
  ): Promise<void> {
    const attempt = this.buildPlaceholderAttempt(row.sponsorship_id, row.period, nextAttemptNumber);
    const expireByDay =
      nextAttemptNumber === 2 ? config.expireAttempt2Day : config.expireAttempt3Day;

    await this.prisma.withOrgContext(row.organization_id, async (tx) => {
      await tx.sponsorshipPaymentAttempt.updateMany({
        where: {
          sponsorshipPaymentId: row.payment_id,
          attemptNumber: expiringAttemptNumber,
          result: 'pending',
        },
        data: { result: 'expired' },
      });
      await tx.sponsorshipPaymentAttempt.create({
        data: {
          organizationId: row.organization_id,
          sponsorshipPaymentId: row.payment_id,
          attemptNumber: nextAttemptNumber,
          collectionId: attempt.collectionId,
          paymentLinkUrl: attempt.paymentLinkUrl,
          idempotencyKey: attempt.idempotencyKey,
          expiresAt: addDays(row.period_started_at, expireByDay),
        },
      });
      await tx.sponsorshipPayment.update({
        where: { id: row.payment_id },
        data: { attemptCount: nextAttemptNumber },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: row.organization_id,
        actorUserId: null,
        action: 'sponsorship.billing_attempt_created',
        entityType: 'sponsorship_payment',
        entityId: row.payment_id,
        metadata: { attemptNumber: nextAttemptNumber },
      });
    });

    await this.notifyBestEffort(
      row.sponsor_email,
      buildChargeSubject(),
      buildChargeBody({
        organizationName: row.organization_name,
        animalName: row.animal_name,
        amount: row.plan_amount,
      }),
    );
  }

  private async expireFinalAttemptAndFailPeriod(
    row: OpenPeriodRow,
    finalAttemptNumber: number,
  ): Promise<void> {
    await this.prisma.withOrgContext(row.organization_id, async (tx) => {
      await tx.sponsorshipPaymentAttempt.updateMany({
        where: {
          sponsorshipPaymentId: row.payment_id,
          attemptNumber: finalAttemptNumber,
          result: 'pending',
        },
        data: { result: 'expired' },
      });
      await tx.sponsorshipPayment.update({
        where: { id: row.payment_id },
        data: { status: 'failed', failedAt: new Date() },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: row.organization_id,
        actorUserId: null,
        action: 'sponsorship.billing_period_failed',
        entityType: 'sponsorship_payment',
        entityId: row.payment_id,
        metadata: { period: row.period },
      });
      await this.sponsorships.applySystemTransition(
        tx,
        row.organization_id,
        row.sponsorship_id,
        SponsorshipStatus.Suspended,
        BILLING_FAILURE_SUSPENSION_REASON,
      );
    });

    const suspensionInput = {
      organizationName: row.organization_name,
      animalName: row.animal_name,
    };
    await this.notifyBestEffort(
      row.sponsor_email,
      buildSuspensionSponsorSubject(),
      buildSuspensionSponsorBody(suspensionInput),
    );
    await this.notifyBestEffort(
      `org:${row.organization_id}`,
      buildSuspensionOrgSubject(),
      buildSuspensionOrgBody(suspensionInput),
    );
  }

  /**
   * T-OrdersAPI (2026-09-30) — DISCOVERED ARCHITECTURE GAP, documented here in
   * full: this method used to call `PaymentPort.createCollection()` to
   * generate a REAL MercadoPago Checkout Pro preference for each automated
   * attempt. Checkout API/Orders (the real gateway's replacement for Checkout
   * Pro) requires a client-tokenized card at the MOMENT of the charge — this
   * unattended daily cron has no sponsor present to produce one, and
   * off-session stored-card/customer vaulting (MercadoPago's separate
   * Customers & Cards API) is explicitly OUT OF SCOPE for this task. Calling
   * the real adapter from here would therefore ALWAYS throw.
   *
   * Resolution taken (judgment call, not a pre-existing requirement): this
   * method no longer calls the gateway at all. It only builds a LOCAL
   * placeholder (`collectionId: 'pending-<idempotencyKey>'`, no
   * `paymentLinkUrl` — there is no checkout link in this model any more
   * either way). The ladder's TIMING (reminders/expiry/suspension days) is
   * COMPLETELY UNCHANGED — only "this step also creates a real charge
   * attempt" is gone. The sponsor's one real, working path to actually pay
   * is `SponsorshipPaymentsService.retryPayment` ("Pagar de nuevo" in "Mis
   * apadrinamientos"), reachable once the period is suspended for billing
   * failure — THAT endpoint now embeds the real Card Payment Brick and calls
   * the gateway with an actual token.
   *
   * Net effect: every period still needs 30 days (the existing ladder) to
   * reach the one moment a sponsor can really pay. TODO(client): recommend
   * deciding, as a fast-follow, between (a) MercadoPago Customer+Card
   * vaulting for real off-session recurring charges, or (b) converting EVERY
   * period (not only post-suspension recovery) into an immediate in-app
   * "pay now" prompt the moment it opens.
   */
  private buildPlaceholderAttempt(
    sponsorshipId: string,
    period: string,
    attemptNumber: number,
  ): { collectionId: string; idempotencyKey: string; paymentLinkUrl?: string } {
    const idempotencyKey = buildAttemptIdempotencyKey(sponsorshipId, period, attemptNumber);
    return { collectionId: `pending-${idempotencyKey}`, idempotencyKey };
  }

  private async notifyBestEffort(to: string, subject: string, body: string): Promise<void> {
    try {
      await this.notifications.send({ to, subject, body });
    } catch (error) {
      this.logger.warn(
        `Sponsorship billing notification failed (to=${to}): ${(error as Error).message}`,
      );
    }
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
