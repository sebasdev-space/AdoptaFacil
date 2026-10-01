import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  computeBreakdown,
  type CreateDonationInput,
  type Donation,
  type DonationDonor,
  type DonationReceipt,
  type DonationStatus,
  type DonationPublicStatus,
  type DonationWithReceipt,
  type GuestDonationAccess,
  type NormalizedWebhookEvent,
  type PaymentBreakdown,
  type PaymentConcept,
  type PaymentPort,
  type WebhookVerificationContext,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditService } from '../../core/audit/audit.service';
import { PAYMENT_PORT } from '../../core/payments/payment.port';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import type { RequestUser } from '../../core/auth/auth.types';
import { requireCompleteProfile } from '../../core/auth/require-complete-profile';
import type { Env } from '../../config/env.validation';
import { CampaignFundingService } from '../campaigns/campaign-funding.service';
import { DonationCertificatesService } from './donation-certificates.service';
import { buildDonationAccessLink } from './donation-access-link';

/**
 * How long a guest's donation access link (magic link) stays valid (client's
 * own words, final: "acceso seguro... con expiración"). Unlike the password-
 * reset token this is NOT single-use — the guest may re-open it repeatedly —
 * and the TTL is generous (30 days) because it's informational access to a
 * receipt/certificate, not a sensitive account mutation.
 */
const DONATION_ACCESS_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

/** Row shape returned by the SECURITY DEFINER donation functions (snake_case). */
interface DonationRow {
  id: string;
  organization_id: string;
  donor_user_id: string | null;
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
  anonymous: boolean;
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

/** Row shape returned by `donation_certificate_by_donation` (snake_case; same
 *  `payload` shape as `DonationCertificatesService`'s own `CertificateRow`). */
interface AccessCertificateRow {
  id: string;
  organization_id: string;
  donation_id: string;
  code: string;
  payload: {
    organizationName: string;
    organizationNit: string;
    donorName: string;
    amount: number;
    currency: string;
  };
  content_hash: string;
  issued_at: Date;
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
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PORT) private readonly payment: PaymentPort,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    private readonly campaignFunding: CampaignFundingService,
    private readonly certificates: DonationCertificatesService,
    config: ConfigService<Env, true>,
  ) {
    this.webBaseUrl = config.get('WEB_BASE_URL', { infer: true });
  }

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Create a donation as an authenticated PERSON OR a GUEST (§M05, P1 +
   * guest-checkout requirement: donating must never require an account/login).
   * The donation lands in the BENEFICIARY org's tenant via `create_donation`
   * (SECURITY DEFINER; the donor is not a member of that org, and for a guest
   * there is no donor account at all). The commission math is computed HERE
   * with `computeBreakdown` (the single source — the client never supplies
   * amounts beyond `intendedAmount`) and the collection is processed through
   * the PaymentPort.
   *
   * `actor` is `undefined` for a guest (set by `OptionalJwtAuthGuard`, which
   * never rejects the request). The profile-completion gate
   * (`requireCompleteProfile`) only applies to an authenticated Persona — it is
   * skipped entirely for a guest, who has no profile to complete. A guest MUST
   * supply at least `payer.email` (validated here, not in the zod schema,
   * because the requirement depends on `actor`) so there is at least one way to
   * identify/contact them about the donation; `documentId` is a separate,
   * later concern (collected only when a tax certificate is requested).
   *
   * Idempotent by (organizationId, idempotencyKey): a retry returns the SAME donation
   * without a second charge or a duplicate audit entry.
   */
  async create(actor: RequestUser | undefined, input: CreateDonationInput): Promise<Donation> {
    if (actor) {
      await requireCompleteProfile(this.prisma, actor);
    } else if (!input.payer?.email) {
      throw new BadRequestException(
        'Para donar sin una cuenta necesitamos al menos tu correo electrónico.',
      );
    }

    const concept: PaymentConcept = input.concept ?? {
      kind: 'organization',
      id: input.organizationId,
    };

    // Idempotency pre-check (cross-tenant read): a retry short-circuits before any
    // side effect (no re-charge, no re-audit). `create_donation` also guards the race
    // with ON CONFLICT DO NOTHING, so concurrency never duplicates the row.
    const existing = await this.findByIdempotencyKey(input.organizationId, input.idempotencyKey);
    if (existing) {
      // No `paymentLinkUrl` here on purpose: a retry never calls the gateway
      // again, so there is no fresh link to attach — the caller's FIRST
      // response already carried the one (still-live) checkout link.
      return this.fromRow(existing);
    }

    // Single source of the money math (RNF12); persisted verbatim.
    const breakdown = computeBreakdown(input.intendedAmount, input.commissionPayer);

    // Split de Pagos 1:1 (T-OAuth-Connect): if the BENEFICIARY org connected
    // its own MercadoPago account, route the charge directly to it — read
    // ONLY the mp_user_id (never the tokens), cross-tenant, via a bounded
    // SECURITY DEFINER function (same posture as `organizationNamesById`
    // below). Absent ⇒ undefined ⇒ old single-account behavior, unchanged.
    const sponsorMpUserId = await this.resolveSponsorMpUserId(input.organizationId);

    // Process the collection through the port (fake in Ola 1; Checkout API/
    // Orders for the real MercadoPago driver, T-OrdersAPI). Ids are derived
    // from the idempotency key, so a retry maps to the same collection.
    const collection = await this.payment.createCollection({
      intendedAmount: input.intendedAmount,
      currency: 'COP',
      concept,
      commissionPayer: input.commissionPayer,
      payer: input.payer,
      idempotencyKey: input.idempotencyKey,
      cardToken: input.cardToken,
      paymentMethodId: input.paymentMethodId,
      paymentMethodType: input.paymentMethodType,
      installments: input.installments,
      sponsorMpUserId,
    });

    let rows: DonationRow[];
    try {
      rows = await this.prisma.$queryRaw<DonationRow[]>(Prisma.sql`
        SELECT * FROM create_donation(
          ${input.organizationId}::uuid,
          ${actor?.id ?? null}::uuid,
          ${concept.kind},
          ${concept.id}::uuid,
          ${input.commissionPayer},
          ${input.intendedAmount}::int,
          ${breakdown.amountCharged}::int,
          ${JSON.stringify(breakdown)}::jsonb,
          ${collection.collectionId},
          ${input.idempotencyKey},
          ${input.payer ? JSON.stringify(input.payer) : null}::jsonb,
          ${input.anonymous ?? false}
        )
      `);
    } catch (error) {
      // `create_donation` only guards (organizationId, idempotencyKey) with
      // ON CONFLICT DO NOTHING — a repeated `collectionId` (the OTHER unique
      // constraint on `donations`) still hits Postgres and propagates as a raw
      // query error (typically P2010, real code/constraint in `meta`), same
      // class of bug as the Organizaciones slug 500.
      if (this.isCollectionConflict(error)) {
        throw new ConflictException('Ya existe una donación con este recaudo.');
      }
      throw error;
    }
    const row = rows[0];

    await this.audit.record({
      organizationId: input.organizationId,
      actorUserId: actor?.id ?? null,
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

    // `create_donation` ALWAYS seeds 'pending' (never a terminal status) —
    // the webhook is the sole, exactly-once writer of 'approved'/'declined'
    // (its `apply_donation_webhook`'s `WHERE status = 'pending'` guard is
    // also what gates receipt issuance, so the DB write here must stay
    // untouched). But MercadoPago's Orders API often already KNOWS the
    // outcome synchronously (e.g. a card decline, T-OrdersAPI) — surfacing
    // that in THIS response only (never persisted) lets the donor see the
    // real result immediately instead of a misleading "confirmando tu pago"
    // for an already-failed charge. The webhook still arrives afterward and
    // does the real, once-only DB transition + receipt issuance, unchanged.
    const immediateStatus: DonationStatus | undefined =
      collection.status === 'approved' || collection.status === 'declined'
        ? collection.status
        : undefined;

    // `paymentLinkUrl` is attached ONLY here, on the just-created object this
    // method returns — never persisted (see the field's doc comment on
    // `Donation`) and never present when the SAME row is read back later
    // (`fromRow` alone, used by `listMine`/`getByAccessToken`, never sets it).
    return {
      ...this.fromRow(row),
      ...(immediateStatus ? { status: immediateStatus } : {}),
      paymentLinkUrl: collection.paymentLinkUrl,
    };
  }

  /**
   * PUBLIC, minimal status read for the post-checkout "gracias" page —
   * MercadoPago redirects the payer back with `external_reference`, which IS
   * our own `collectionId` (see `createCollection`'s doc comment). Cross-
   * tenant (no session, no tenant context) via a bounded SECURITY DEFINER
   * function, same "never distinguish 404 reasons" principle as
   * `getByAccessToken`: an unknown reference is a single generic 404, never a
   * hint about whether one might exist. Deliberately narrow response — status/
   * amount/org name only, never the payer's identity.
   */
  async getPublicStatusByCollectionId(collectionId: string): Promise<DonationPublicStatus> {
    const rows = await this.prisma.$queryRaw<DonationRow[]>(Prisma.sql`
      SELECT * FROM donation_by_collection_id(${collectionId})
    `);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Donación no encontrada.');
    }
    const orgNames = await this.organizationNamesById([row.organization_id]);
    return {
      status: row.status as DonationStatus,
      amountCharged: row.amount_charged,
      currency: row.currency as Donation['currency'],
      organizationName: orgNames.get(row.organization_id) ?? '',
    };
  }

  /**
   * Apply a gateway webhook (fake in Ola 1). The port verifies the signature and
   * normalizes the event; `apply_donation_webhook` then settles the donation
   * (pending → approved | declined) and, on approval, emits the receipt — all
   * idempotent: a repeated delivery (same `dedupKey`) is a no-op and never emits a
   * second receipt. Both the settlement and the receipt are AUDITED (UTC).
   */
  async applyWebhook(
    payload: unknown,
    signature: string,
    context?: WebhookVerificationContext,
  ): Promise<WebhookOutcome> {
    let event: NormalizedWebhookEvent;
    try {
      event = await this.payment.verifyAndNormalizeWebhook(payload, signature, context);
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

      if (donation.concept_kind === 'campaign') {
        await this.applyCampaignFunding(donation.organization_id, donation.id, event.collectionId);
      }

      // F-3 (RF14): certificado real, emitido junto al recibo. Best-effort y
      // sin gating aquí — el servicio decide si la org es ESAL-RTE elegible;
      // si no lo es, simplemente no emite nada (no es un fallo del webhook).
      await this.certificates.tryIssueForApprovedDonation({
        donationId: donation.id,
        organizationId: donation.organization_id,
        donorName: donation.payer?.fullName,
        amount: donation.intended_amount,
        currency: donation.currency,
      });

      // Client requirement (final): a GUEST donor (no account) must be able to
      // check their donation later WITHOUT registering. Only for a guest
      // (donor_user_id IS NULL) — an authenticated donor already has
      // `/donations/mine`. Best-effort, same reasoning as the certificate
      // above: the donation is already approved and its receipt already
      // issued, so a failure here must never fail the webhook response.
      if (!donation.donor_user_id && donation.payer?.email) {
        await this.issueGuestAccessLink(
          donation.id,
          donation.organization_id,
          donation.payer.email,
        );
      }
    }

    return { applied: true, status, donationId: donation.id };
  }

  /**
   * Generates + persists a guest donation access token (hashed, never stored
   * in clear — same principle as the password-reset token) and emails the
   * resulting "magic link" through the shared NotificationPort. NOT under
   * tenant context: `DonationAccessLink` carries no `organizationId` and no
   * RLS (anonymous lookup table, same reasoning as `PasswordResetToken`).
   * Best-effort: logs and swallows on failure, never throws into the webhook.
   */
  private async issueGuestAccessLink(
    donationId: string,
    organizationId: string,
    payerEmail: string,
  ): Promise<void> {
    try {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await this.prisma.donationAccessLink.create({
        data: {
          donationId,
          tokenHash,
          expiresAt: new Date(Date.now() + DONATION_ACCESS_LINK_TTL_MS),
        },
      });
      await this.audit.record({
        organizationId,
        actorUserId: null,
        action: 'donation.access_link_issued',
        entityType: 'donation',
        entityId: donationId,
        // Nunca el token/enlace en claro — solo que se emitió.
        metadata: {},
      });

      const accessLink = buildDonationAccessLink(this.webBaseUrl, token);
      await this.notifications.send({
        to: payerEmail,
        subject: 'Tu comprobante de donación en AdoptaFácil',
        body:
          'Hola,\n\n' +
          '¡Gracias por tu donación! Tu pago fue confirmado.\n' +
          'Puedes consultar el estado, el recibo y el certificado (si aplica) de tu donación ' +
          'en cualquier momento, sin necesidad de crear una cuenta, con este enlace ' +
          '(disponible durante 30 días):\n\n' +
          `${accessLink}\n\n` +
          'Guarda este correo si quieres volver a consultarlo más adelante.',
      });
    } catch (error) {
      // Nunca el token/enlace/correo en el log — solo que el intento falló.
      this.logger.warn(
        `No se pudo emitir el enlace de acceso de invitado para donation=${donationId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * PUBLIC read for a GUEST donor's own donation, reached via the magic link
   * (no session — the token itself IS the credential). Looks up the link by
   * the HASH of the incoming token (never the raw token) and rejects with a
   * single, generic 404 whether the token is missing, malformed, unknown, or
   * expired — the three cases must never be distinguishable to a caller
   * probing tokens (same principle as `getReceiptForDonor`'s identity guard).
   * NOT single-use: a valid, unexpired token can be reused freely.
   */
  async getByAccessToken(token: string): Promise<GuestDonationAccess> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const link = await this.prisma.donationAccessLink.findUnique({ where: { tokenHash } });
    if (!link || link.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException('Enlace no válido o expirado.');
    }

    const rows = await this.prisma.$queryRaw<DonationRow[]>(Prisma.sql`
      SELECT * FROM donation_by_id(${link.donationId}::uuid)
    `);
    const row = rows[0];
    if (!row) {
      // The donation was deleted after the link was issued (shouldn't happen
      // in practice — FK is ON DELETE CASCADE) — same generic 404.
      throw new NotFoundException('Enlace no válido o expirado.');
    }

    const orgNames = await this.organizationNamesById([row.organization_id]);
    const donation = this.fromRow(row, orgNames.get(row.organization_id));

    let receipt: DonationReceipt | undefined;
    const receiptRows = await this.prisma.$queryRaw<ReceiptRow[]>(Prisma.sql`
      SELECT * FROM donation_receipt_by_donation(${row.id}::uuid)
    `);
    if (receiptRows[0]) {
      receipt = this.fromReceiptRow(receiptRows[0]);
    }

    const certificateRows = await this.prisma.$queryRaw<AccessCertificateRow[]>(Prisma.sql`
      SELECT * FROM donation_certificate_by_donation(${row.id}::uuid)
    `);
    const certificate = certificateRows[0]
      ? this.fromAccessCertificateRow(certificateRows[0])
      : undefined;

    return { donation, receipt, certificate };
  }

  private fromAccessCertificateRow(
    row: AccessCertificateRow,
  ): NonNullable<GuestDonationAccess['certificate']> {
    return {
      id: row.id,
      organizationId: row.organization_id,
      donationId: row.donation_id,
      code: row.code,
      organizationName: row.payload.organizationName,
      organizationNit: row.payload.organizationNit,
      donorName: row.payload.donorName,
      amount: row.payload.amount,
      currency: row.payload.currency as Donation['currency'],
      issuedAt: row.issued_at.toISOString(),
      contentHash: row.content_hash,
    };
  }

  /**
   * Apply an approved campaign-concept donation to its campaign's raised amount
   * (T-057 enganche), reusing Sebastián's idempotent `CampaignFundingService` (a
   * repeated collectionId is a safe no-op there too). Best-effort: the donation is
   * ALREADY approved and its receipt ALREADY issued by this point, so a failure
   * here (e.g. the campaign was closed/cancelled between donation and webhook) is
   * audited and swallowed — it must never revert or fail the webhook response.
   */
  private async applyCampaignFunding(
    organizationId: string,
    donationId: string,
    collectionId: string,
  ): Promise<void> {
    try {
      await this.campaignFunding.applyApprovedCollection(collectionId);
    } catch (error) {
      this.logger.warn(
        `Campaign funding enganche failed for donation=${donationId} collectionId=${collectionId}: ${(error as Error).message}`,
      );
      await this.audit.record({
        organizationId,
        actorUserId: null,
        action: 'donation.campaign_funding_failed',
        entityType: 'donation',
        entityId: donationId,
        metadata: { collectionId, reason: (error as Error).message },
      });
    }
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

  /**
   * The donor's own donations (cross-tenant via SECURITY DEFINER, by identity),
   * enriched with the beneficiary org's display name (S1-02) so Fabián's "mis
   * donaciones" inbox doesn't have to do N+1 requests or show a raw id.
   *
   * `donations_for_donor` returns `SETOF "donations"` (no join) because it lives
   * in an already-shipped migration and this task is query+contract only (no
   * migrations) — so the name is resolved with a second, batched lookup instead
   * of a join inside the function. `organizations` carries NO RLS policy of its
   * own (it is the tenant anchor, not tenant-scoped data — same trust boundary
   * the public-portal SECURITY DEFINER functions already rely on), so reading
   * it directly by id, cross-tenant, needs no `withOrgContext`.
   */
  async listMine(actor: RequestUser): Promise<Donation[]> {
    const rows = await this.prisma.$queryRaw<DonationRow[]>(Prisma.sql`
      SELECT * FROM donations_for_donor(${actor.id}::uuid)
    `);
    const orgNames = await this.organizationNamesById(rows.map((r) => r.organization_id));
    return rows.map((r) => this.fromRow(r, orgNames.get(r.organization_id)));
  }

  /**
   * Split de Pagos 1:1 (T-OAuth-Connect) — looks up the ORG's own connected
   * MercadoPago account id, cross-tenant, via the `mercadopago_account_mp_user_id`
   * SECURITY DEFINER function (narrow: returns ONLY `mp_user_id`, never the
   * access/refresh tokens — see its migration for the same posture as
   * `mercadopago_accounts_due_for_refresh`). `undefined` when the org never
   * connected an account (the common case in Ola 1) — never thrown.
   */
  private async resolveSponsorMpUserId(organizationId: string): Promise<string | undefined> {
    const rows = await this.prisma.$queryRaw<{ mp_user_id: string }[]>(Prisma.sql`
      SELECT * FROM mercadopago_account_mp_user_id(${organizationId}::uuid)
    `);
    return rows[0]?.mp_user_id;
  }

  private async organizationNamesById(ids: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true },
    });
    return new Map(orgs.map((org) => [org.id, org.name]));
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

  /** A raw-query error caused by the `donations_collection_id_key` unique index. */
  private isCollectionConflict(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = JSON.stringify(error.meta ?? {});
      return (
        error.code === 'P2002' ||
        meta.includes('donations_collection_id_key') ||
        meta.includes('23505')
      );
    }
    return false;
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

  private fromRow(row: DonationRow, organizationName?: string): Donation {
    return {
      id: row.id,
      organizationId: row.organization_id,
      organizationName,
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
      anonymous: row.anonymous,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /**
   * The BENEFICIARY org's view of a received donation. When `anonymous` is
   * true, the donor's identity is masked from the ORG (never from AdoptaFácil
   * itself — nothing here changes what is persisted, only what this endpoint
   * returns): both `payer` and `receipt.donor` are omitted, everything else
   * (amount/date/status/breakdown) stays intact.
   */
  private fromModel(row: DonationModel): DonationWithReceipt {
    const anonymous = row.anonymous;
    const receipt = row.receipt ? this.fromReceiptModel(row.receipt) : undefined;
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
      payer: anonymous ? undefined : ((row.payer as unknown as DonationDonor | null) ?? undefined),
      anonymous,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      receipt: receipt && anonymous ? { ...receipt, donor: {} } : receipt,
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
