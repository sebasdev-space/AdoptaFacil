import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { BILLING_FAILURE_SUSPENSION_REASON, SponsorshipStatus } from '@adoptafacil/contracts';
import type { PaymentPort } from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import type { Env } from '../../config/env.validation';
import { PAYMENT_PORT } from '../../core/payments/payment.port';
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
    @Inject(PAYMENT_PORT) private readonly payments: PaymentPort,
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
      await this.openPeriodFor(row);
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

    const attempt = await this.createAttemptCollection(
      row.sponsorship_id,
      period,
      1,
      row.plan_amount,
    );

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
    const attempt = await this.createAttemptCollection(
      row.sponsorship_id,
      row.period,
      nextAttemptNumber,
      row.plan_amount,
    );
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

  /** Calls `PaymentPort.createCollection()` for one attempt — OUTSIDE any DB
   *  transaction (same convention as `DonationsService.create`), so a slow
   *  gateway call never holds a DB transaction open. Idempotent by
   *  construction: the deterministic key means a retry after a crash returns
   *  the SAME `collectionId`, never a second charge. */
  private async createAttemptCollection(
    sponsorshipId: string,
    period: string,
    attemptNumber: number,
    amount: number,
  ): Promise<{ collectionId: string; idempotencyKey: string }> {
    const idempotencyKey = buildAttemptIdempotencyKey(sponsorshipId, period, attemptNumber);
    const collection = await this.payments.createCollection({
      intendedAmount: amount,
      currency: 'COP',
      concept: { kind: 'sponsorship', id: sponsorshipId },
      commissionPayer: 'organization',
      idempotencyKey,
    });
    return { collectionId: collection.collectionId, idempotencyKey };
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
