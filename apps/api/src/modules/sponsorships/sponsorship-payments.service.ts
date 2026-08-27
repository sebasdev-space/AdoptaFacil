import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  SponsorshipPayment as SponsorshipPaymentModel,
  SponsorshipPaymentAttempt as AttemptModel,
} from '@prisma/client';
import {
  BILLING_FAILURE_SUSPENSION_REASON,
  type PaymentPort,
  type SponsorshipPayment,
  type SponsorshipPaymentAttempt,
  SponsorshipPaymentAttemptResult,
  SponsorshipPaymentStatus,
  SponsorshipStatus,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import type { Env } from '../../config/env.validation';
import { PAYMENT_PORT } from '../../core/payments/payment.port';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { buildAttemptIdempotencyKey } from './sponsorship-billing';

/** Row from `sponsorship_billing_recovery_context(...)` (snake_case, raw SQL). */
interface RecoveryContextRow {
  organization_id: string;
  plan_amount: number;
  failed_payment_id: string;
  period: string;
  attempt_count: number;
}

function toAttempt(row: AttemptModel): SponsorshipPaymentAttempt {
  return {
    id: row.id,
    sponsorshipPaymentId: row.sponsorshipPaymentId,
    attemptNumber: row.attemptNumber,
    collectionId: row.collectionId,
    paymentLinkUrl: row.paymentLinkUrl ?? undefined,
    expiresAt: row.expiresAt.toISOString(),
    result: row.result as SponsorshipPaymentAttemptResult,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPayment(
  row: SponsorshipPaymentModel & { attempts: AttemptModel[] },
): SponsorshipPayment {
  return {
    id: row.id,
    sponsorshipId: row.sponsorshipId,
    organizationId: row.organizationId,
    period: row.period,
    status: row.status as SponsorshipPaymentStatus,
    attempts: row.attempts.map(toAttempt),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Billing ledger reads + sponsor-initiated recovery (S-5-REDISEÑO, M07/RF17,
 * T-057). The automated ladder itself lives in `SponsorshipBillingService`
 * (the daily job) — this is the user-facing surface: the org's full payment
 * history per sponsorship (Objetivo 7/contract-shape), and the sponsor's own
 * "pay a new link" recovery action (Objetivo 6).
 */
@Injectable()
export class SponsorshipPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    @Inject(PAYMENT_PORT) private readonly payments: PaymentPort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new BadRequestException('Missing tenant context');
    }
    return organizationId;
  }

  /** Full billing ledger of one sponsorship, oldest period first (org-facing,
   *  VIEW_ROLES) — satisfies the contract-shape requirement for
   *  `SponsorshipPayment`/`SponsorshipPaymentAttempt`. */
  async listForSponsorship(sponsorshipId: string): Promise<SponsorshipPayment[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const sponsorship = await tx.sponsorship.findUnique({ where: { id: sponsorshipId } });
      if (!sponsorship || sponsorship.organizationId !== organizationId) {
        throw new NotFoundException('Sponsorship not found');
      }
      const rows = await tx.sponsorshipPayment.findMany({
        where: { sponsorshipId },
        orderBy: { createdAt: 'asc' },
        include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
      });
      return rows.map(toPayment);
    });
  }

  /**
   * Sponsor-initiated recovery (Objetivo 6) — cross-tenant (the sponsor is
   * not a member of the sponsored org), no `@Roles` gate: any authenticated
   * Person may retry ONLY their own suspended sponsorship. Generates a
   * BRAND NEW payment-link attempt against the historical failed period
   * (never a retry of an already-expired link); confirming it later (the
   * SAME poller that confirms the automated ladder) auto-reactivates the
   * sponsorship — but ONLY because it was suspended for billing failure, not
   * a manual suspension by the organization.
   */
  async retryPayment(actor: RequestUser, sponsorshipId: string): Promise<SponsorshipPayment> {
    const rows = await this.prisma.$queryRaw<RecoveryContextRow[]>(
      Prisma.sql`SELECT * FROM sponsorship_billing_recovery_context(${sponsorshipId}::uuid, ${actor.id}::uuid)`,
    );
    const ctx = rows[0];
    if (!ctx) {
      throw new NotFoundException(
        'No suspended sponsorship with a failed billing period was found for you.',
      );
    }

    const isBillingSuspension = await this.prisma.withOrgContext(ctx.organization_id, (tx) =>
      tx.sponsorshipStatusHistory
        .findFirst({
          where: { sponsorshipId, toStatus: SponsorshipStatus.Suspended },
          orderBy: { createdAt: 'desc' },
        })
        .then((last) => last?.reason === BILLING_FAILURE_SUSPENSION_REASON),
    );
    if (!isBillingSuspension) {
      throw new BadRequestException(
        'This sponsorship was suspended by the organization, not for a failed payment — a new link here would not reactivate it automatically.',
      );
    }

    const nextAttemptNumber = ctx.attempt_count + 1;
    const idempotencyKey = buildAttemptIdempotencyKey(sponsorshipId, ctx.period, nextAttemptNumber);
    const collection = await this.payments.createCollection({
      intendedAmount: ctx.plan_amount,
      currency: 'COP',
      concept: { kind: 'sponsorship', id: sponsorshipId },
      commissionPayer: 'organization',
      idempotencyKey,
    });

    // Reuses the SAME expiry window as attempt 1 — this is a one-off,
    // sponsor-initiated link, not a rung of the automated ladder, so it has
    // no natural "day N of the period" to derive from.
    const windowDays = this.config.get('SPONSORSHIP_EXPIRE_ATTEMPT_1_DAY', { infer: true });
    const expiresAt = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000);

    return this.prisma.withOrgContext(ctx.organization_id, async (tx) => {
      await tx.sponsorshipPaymentAttempt.create({
        data: {
          organizationId: ctx.organization_id,
          sponsorshipPaymentId: ctx.failed_payment_id,
          attemptNumber: nextAttemptNumber,
          collectionId: collection.collectionId,
          idempotencyKey,
          expiresAt,
        },
      });
      const updated = await tx.sponsorshipPayment.update({
        where: { id: ctx.failed_payment_id },
        data: { attemptCount: nextAttemptNumber },
        include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: ctx.organization_id,
        actorUserId: actor.id,
        action: 'sponsorship.billing_recovery_attempt_created',
        entityType: 'sponsorship_payment',
        entityId: ctx.failed_payment_id,
        metadata: { attemptNumber: nextAttemptNumber },
      });
      return toPayment(updated);
    });
  }
}
