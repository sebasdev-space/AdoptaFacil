import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import type { PayoutView, PaymentPort } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { PAYMENT_PORT } from '../../core/payments/payment.port';
import { BankAccountsService } from './bank-accounts.service';
import { PAYOUT_DISPATCH_JOB, PAYOUTS_QUEUE } from './payouts.constants';
import { PAYOUT_MAX_ATTEMPTS } from './payouts.window';

/** Row shape returned by the SECURITY DEFINER payout functions (snake_case). */
interface PayoutRow {
  id: string;
  organization_id: string;
  amount: number;
  currency: string;
  idempotency_key: string;
  wompi_payout_id: string | null;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

function fromRow(row: PayoutRow): PayoutView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    amount: row.amount,
    currency: row.currency as PayoutView['currency'],
    idempotencyKey: row.idempotency_key,
    wompiPayoutId: row.wompi_payout_id ?? undefined,
    status: row.status as PayoutView['status'],
    attempts: row.attempts,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * M15b (RF26) — dispersión T+1. `requestPayout` is the PlatformAdmin-triggered
 * entry point (a treasury operation): it persists the attempt idempotently and
 * enqueues the actual Wompi call on a BullMQ worker so a gateway hiccup retries
 * with backoff instead of failing the HTTP request. `dispatch` is what the
 * worker calls; `applyWebhook` settles the payout from Wompi's confirmation —
 * completely mirrors the donations webhook flow (M05), just for the payout side.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger('Payouts');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly bankAccounts: BankAccountsService,
    @Inject(PAYMENT_PORT) private readonly payment: PaymentPort,
    @InjectQueue(PAYOUTS_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Trigger a payout (PlatformAdmin/PlatformSuperAdmin, RBAC-gated at the
   * controller). Idempotent by (organizationId, idempotencyKey) via
   * `create_payout` (SECURITY DEFINER — the caller's own tenant is the
   * platform admin's org, not the beneficiary's, same cross-tenant technique
   * as `create_donation`). A retry with the same key returns the SAME row and
   * is NEVER re-enqueued once already dispatched (has a `wompiPayoutId`).
   */
  async requestPayout(
    actorUserId: string,
    organizationId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<PayoutView> {
    const rows = await this.prisma.$queryRaw<PayoutRow[]>(Prisma.sql`
      SELECT * FROM create_payout(${organizationId}::uuid, ${amount}::int, ${idempotencyKey})
    `);
    const row = rows[0];

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'payments.payout_requested',
      entityType: 'payout',
      entityId: row.id,
      metadata: { amount, idempotencyKey },
    });

    if (!row.wompi_payout_id) {
      // Not yet dispatched (new row, or a previous dispatch never succeeded) —
      // enqueue exactly once. BullMQ's own retry/backoff covers gateway
      // failures; re-enqueueing a job for an ALREADY dispatched payout would
      // risk a second Wompi call, so this check is the guard against that.
      await this.queue.add(
        PAYOUT_DISPATCH_JOB,
        { payoutId: row.id, organizationId },
        {
          attempts: PAYOUT_MAX_ATTEMPTS,
          backoff: { type: 'custom' },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }

    return fromRow(row);
  }

  /**
   * Dispatch ONE payout to Wompi (called by the BullMQ worker). Throws on
   * failure so BullMQ retries with the staggered backoff (RNF07-style,
   * `payoutBackoffMs`) — same pattern as `RemindersService.send`. Runs under
   * `withOrgContext(organizationId, ...)` because the WORKER has no request
   * tenant context of its own (same as the reminders/clinical workers).
   */
  async dispatch(payoutId: string, organizationId: string): Promise<void> {
    // The DB write and the "signal BullMQ to retry" throw must NOT share a
    // Prisma interactive transaction: throwing inside `withOrgContext`'s
    // callback rolls back everything written in it (the failure state would
    // never persist). So each branch below writes INSIDE the transaction and
    // throws AFTER it commits — same shape as `RemindersService.send`.
    let failure: string | null = null;

    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const payout = await tx.payout.findUnique({ where: { id: payoutId } });
      if (!payout) {
        return; // purged/unknown — nothing to do
      }
      if (payout.wompiPayoutId) {
        return; // already dispatched successfully — never call Wompi twice
      }

      const bankAccount = await this.bankAccounts.findForOrgTx(tx, organizationId);
      if (!bankAccount) {
        const message = 'La organización no tiene una cuenta bancaria registrada.';
        await tx.payout.update({
          where: { id: payoutId },
          data: { attempts: { increment: 1 }, lastError: message, status: 'failed' },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId: null,
          action: 'payments.payout_dispatch_failed',
          entityType: 'payout',
          entityId: payoutId,
          metadata: { reason: 'missing_bank_account' },
        });
        // Still signal retry: registering the account between attempts is
        // plausible, and BullMQ's staggered backoff gives up to 24h for it.
        failure = message;
        return;
      }

      try {
        const result = await this.payment.createPayout({
          beneficiaryOrgId: organizationId,
          amount: payout.amount,
          idempotencyKey: payout.idempotencyKey,
          bankAccount: {
            bankCode: bankAccount.bankCode,
            accountType: bankAccount.accountType,
            accountNumber: bankAccount.accountNumber,
            accountHolderName: bankAccount.accountHolderName,
            accountHolderDocument: bankAccount.accountHolderDocument,
          },
        });
        await tx.payout.update({
          where: { id: payoutId },
          data: {
            wompiPayoutId: result.payoutId,
            status: result.status,
            lastError: null,
          },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId: null,
          action: 'payments.payout_dispatched',
          entityType: 'payout',
          entityId: payoutId,
          metadata: { wompiPayoutId: result.payoutId, status: result.status },
        });
      } catch (error) {
        const message = (error as Error).message;
        await tx.payout.update({
          where: { id: payoutId },
          data: { attempts: { increment: 1 }, lastError: message, status: 'failed' },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId: null,
          action: 'payments.payout_dispatch_failed',
          entityType: 'payout',
          entityId: payoutId,
          metadata: { reason: message },
        });
        failure = message;
      }
    });

    if (failure) {
      // A plain Error, not an HttpException: this throw is a retry signal for
      // BullMQ, never surfaced as an HTTP response (unlike `BadRequestException`
      // elsewhere in this file, which the CONTROLLER layer does turn into one).
      throw new Error(failure);
    }
  }

  /**
   * Apply a Wompi payout-confirmation webhook (PUBLIC, no JWT — same posture
   * as the donations webhook). Idempotent: `apply_payout_webhook` only
   * transitions a payout from 'scheduled', so a repeated delivery is a no-op.
   */
  async applyWebhook(payload: unknown, signature: string): Promise<void> {
    let event;
    try {
      event = this.payment.verifyAndNormalizePayoutWebhook(payload, signature);
    } catch (error) {
      this.logger.warn(`Payout webhook rechazado (firma inválida): ${(error as Error).message}`);
      throw new BadRequestException('Webhook signature verification failed.');
    }

    const rows = await this.prisma.$queryRaw<PayoutRow[]>(Prisma.sql`
      SELECT * FROM apply_payout_webhook(${event.payoutId}, ${event.status})
    `);
    const row = rows[0];
    if (!row) {
      return; // payout desconocido o ya asentado ⇒ no-op idempotente
    }

    await this.audit.record({
      organizationId: row.organization_id,
      actorUserId: null,
      action: row.status === 'paid' ? 'payments.payout_paid' : 'payments.payout_failed',
      entityType: 'payout',
      entityId: row.id,
      metadata: { wompiPayoutId: event.payoutId, dedupKey: event.dedupKey },
    });
  }

  /** Admin visibility (PlatformAdmin/PlatformSuperAdmin) — one org's payouts,
   *  bounded read (never an unfiltered dump). Same function Sebastián's M13
   *  dashboard will read from. */
  async listForOrganization(organizationId: string): Promise<PayoutView[]> {
    const rows = await this.prisma.$queryRaw<PayoutRow[]>(Prisma.sql`
      SELECT * FROM payouts_for_organization(${organizationId}::uuid)
    `);
    return rows.map(fromRow);
  }
}
