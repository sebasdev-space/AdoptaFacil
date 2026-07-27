import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  computeBreakdown,
  type CreateDonationInput,
  type Donation,
  type DonationDonor,
  type DonationReceipt,
  type DonationStatus,
  type DonationWithReceipt,
  type NormalizedWebhookEvent,
  type PaymentBreakdown,
  type PaymentConcept,
  type PaymentPort,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditService } from '../../core/audit/audit.service';
import { PAYMENT_PORT } from '../../core/payments/payment.port';
import type { RequestUser } from '../../core/auth/auth.types';

/** Row shape returned by the SECURITY DEFINER donation functions (snake_case). */
interface DonationRow {
  id: string;
  organization_id: string;
  donor_user_id: string;
  concept_kind: string;
  concept_id: string;
  commission_payer: string;
  intended_amount: number;
  amount_charged: number;
  currency: string;
  breakdown: PaymentBreakdown;
  collection_id: string;
  idempotency_key: string;
  status: string;
  payer: DonationDonor | null;
  created_at: Date;
  updated_at: Date;
}

interface ReceiptRow {
  id: string;
  organization_id: string;
  donation_id: string;
  dedup_key: string;
  donor: DonationDonor;
  intended_amount: number;
  breakdown: PaymentBreakdown;
  issued_at: Date;
  created_at: Date;
}

type DonationModel = Prisma.DonationGetPayload<{ include: { receipt: true } }>;
type ReceiptModel = Prisma.DonationReceiptGetPayload<Record<string, never>>;

/** Outcome of applying a (verified) gateway webhook. */
export interface WebhookOutcome {
  applied: boolean;
  status: DonationStatus | null;
  donationId: string | null;
}

@Injectable()
export class DonationsService {
  private readonly logger = new Logger('Donations');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PORT) private readonly payment: PaymentPort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Create a donation as an authenticated PERSON (§M05, P1). The donation lands in
   * the BENEFICIARY org's tenant via `create_donation` (SECURITY DEFINER; the donor
   * is not a member of that org). The commission math is computed HERE with
   * `computeBreakdown` (the single source — the client never supplies amounts beyond
   * `intendedAmount`) and the collection is processed through the PaymentPort.
   *
   * Idempotent by (organizationId, idempotencyKey): a retry returns the SAME donation
   * without a second charge or a duplicate audit entry.
   */
  async create(actor: RequestUser, input: CreateDonationInput): Promise<Donation> {
    const concept: PaymentConcept = input.concept ?? {
      kind: 'organization',
      id: input.organizationId,
    };

    // Idempotency pre-check (cross-tenant read): a retry short-circuits before any
    // side effect (no re-charge, no re-audit). `create_donation` also guards the race
    // with ON CONFLICT DO NOTHING, so concurrency never duplicates the row.
    const existing = await this.findByIdempotencyKey(input.organizationId, input.idempotencyKey);
    if (existing) {
      return this.fromRow(existing);
    }

    // Single source of the money math (RNF12); persisted verbatim.
    const breakdown = computeBreakdown(input.intendedAmount, input.commissionPayer);

    // Process the collection through the port (fake in Ola 1). Ids are derived from
    // the idempotency key, so a retry maps to the same collection.
    const collection = await this.payment.createCollection({
      intendedAmount: input.intendedAmount,
      currency: 'COP',
      concept,
      commissionPayer: input.commissionPayer,
      payer: input.payer,
      idempotencyKey: input.idempotencyKey,
    });

    const rows = await this.prisma.$queryRaw<DonationRow[]>(Prisma.sql`
      SELECT * FROM create_donation(
        ${input.organizationId}::uuid,
        ${actor.id}::uuid,
        ${concept.kind},
        ${concept.id}::uuid,
        ${input.commissionPayer},
        ${input.intendedAmount}::int,
        ${breakdown.amountCharged}::int,
        ${JSON.stringify(breakdown)}::jsonb,
        ${collection.collectionId},
        ${input.idempotencyKey},
        ${input.payer ? JSON.stringify(input.payer) : null}::jsonb
      )
    `);
    const row = rows[0];

    await this.audit.record({
      organizationId: input.organizationId,
      actorUserId: actor.id,
      action: 'donation.created',
      entityType: 'donation',
      entityId: row.id,
      // NUNCA datos personales en claro; solo cifras/estructura.
      metadata: {
        intendedAmount: input.intendedAmount,
        amountCharged: breakdown.amountCharged,
        commissionPayer: input.commissionPayer,
        collectionId: collection.collectionId,
      },
    });

    return this.fromRow(row);
  }

  /**
   * Apply a gateway webhook (fake in Ola 1). The port verifies the signature and
   * normalizes the event; `apply_donation_webhook` then settles the donation
   * (pending → approved | declined) and, on approval, emits the receipt — all
   * idempotent: a repeated delivery (same `dedupKey`) is a no-op and never emits a
   * second receipt. Both the settlement and the receipt are AUDITED (UTC).
   */
  async applyWebhook(payload: unknown, signature: string): Promise<WebhookOutcome> {
    let event: NormalizedWebhookEvent;
    try {
      event = this.payment.verifyAndNormalizeWebhook(payload, signature);
    } catch (error) {
      this.logger.warn(`Webhook rechazado (firma inválida): ${(error as Error).message}`);
      throw new ForbiddenException('Webhook signature verification failed.');
    }

    const rows = await this.prisma.$queryRaw<DonationRow[]>(Prisma.sql`
      SELECT * FROM apply_donation_webhook(
        ${event.collectionId},
        ${event.status},
        ${event.dedupKey}
      )
    `);
    const donation = rows[0];
    if (!donation) {
      // Recaudo desconocido o ya liquidado ⇒ no-op idempotente (webhook duplicado).
      return { applied: false, status: null, donationId: null };
    }

    const status = donation.status as DonationStatus;
    await this.audit.record({
      organizationId: donation.organization_id,
      actorUserId: null,
      action: status === 'approved' ? 'donation.approved' : 'donation.declined',
      entityType: 'donation',
      entityId: donation.id,
      metadata: { collectionId: event.collectionId, dedupKey: event.dedupKey },
    });

    if (status === 'approved') {
      await this.audit.record({
        organizationId: donation.organization_id,
        actorUserId: null,
        action: 'donation.receipt.issued',
        entityType: 'donation_receipt',
        entityId: donation.id,
        metadata: { dedupKey: event.dedupKey },
      });
    }

    return { applied: true, status, donationId: donation.id };
  }

  /** The beneficiary org's received donations with their receipts (RLS-scoped). */
  async listReceived(): Promise<DonationWithReceipt[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.donation.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        include: { receipt: true },
      }),
    );
    return rows.map((r) => this.fromModel(r));
  }

  /** The donor's own donations (cross-tenant via SECURITY DEFINER, by identity). */
  async listMine(actor: RequestUser): Promise<Donation[]> {
    const rows = await this.prisma.$queryRaw<DonationRow[]>(Prisma.sql`
      SELECT * FROM donations_for_donor(${actor.id}::uuid)
    `);
    return rows.map((r) => this.fromRow(r));
  }

  /** The donor's receipt for THEIR OWN donation (cross-tenant, by identity). */
  async getReceiptForDonor(actor: RequestUser, donationId: string): Promise<DonationReceipt> {
    const rows = await this.prisma.$queryRaw<ReceiptRow[]>(Prisma.sql`
      SELECT * FROM donation_receipt_for_donor(${donationId}::uuid, ${actor.id}::uuid)
    `);
    const receipt = rows[0];
    if (!receipt) {
      throw new NotFoundException('Recibo no encontrado o no eres el donante.');
    }
    return this.fromReceiptRow(receipt);
  }

  /** Cross-tenant idempotency read: a donation by (org, key), or null. */
  private async findByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<DonationRow | null> {
    const rows = await this.prisma.$queryRaw<DonationRow[]>(Prisma.sql`
      SELECT * FROM donation_by_idempotency(${organizationId}::uuid, ${idempotencyKey})
    `);
    return rows[0] ?? null;
  }

  private fromRow(row: DonationRow): Donation {
    return {
      id: row.id,
      organizationId: row.organization_id,
      donorUserId: row.donor_user_id,
      concept: { kind: row.concept_kind as PaymentConcept['kind'], id: row.concept_id },
      commissionPayer: row.commission_payer as Donation['commissionPayer'],
      intendedAmount: row.intended_amount,
      amountCharged: row.amount_charged,
      currency: row.currency as Donation['currency'],
      breakdown: row.breakdown,
      collectionId: row.collection_id,
      status: row.status as DonationStatus,
      payer: row.payer ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private fromModel(row: DonationModel): DonationWithReceipt {
    return {
      id: row.id,
      organizationId: row.organizationId,
      donorUserId: row.donorUserId,
      concept: { kind: row.conceptKind as PaymentConcept['kind'], id: row.conceptId },
      commissionPayer: row.commissionPayer as Donation['commissionPayer'],
      intendedAmount: row.intendedAmount,
      amountCharged: row.amountCharged,
      currency: row.currency as Donation['currency'],
      breakdown: row.breakdown as unknown as PaymentBreakdown,
      collectionId: row.collectionId,
      status: row.status as DonationStatus,
      payer: (row.payer as unknown as DonationDonor | null) ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      receipt: row.receipt ? this.fromReceiptModel(row.receipt) : undefined,
    };
  }

  private fromReceiptModel(row: ReceiptModel): DonationReceipt {
    return {
      id: row.id,
      organizationId: row.organizationId,
      donationId: row.donationId,
      dedupKey: row.dedupKey,
      donor: row.donor as unknown as DonationDonor,
      intendedAmount: row.intendedAmount,
      breakdown: row.breakdown as unknown as PaymentBreakdown,
      issuedAt: row.issuedAt.toISOString(),
    };
  }

  private fromReceiptRow(row: ReceiptRow): DonationReceipt {
    return {
      id: row.id,
      organizationId: row.organization_id,
      donationId: row.donation_id,
      dedupKey: row.dedup_key,
      donor: row.donor,
      intendedAmount: row.intended_amount,
      breakdown: row.breakdown,
      issuedAt: row.issued_at.toISOString(),
    };
  }
}
