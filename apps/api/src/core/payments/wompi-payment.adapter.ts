import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  computeBreakdown,
  type CollectionResult,
  type CreateCollectionInput,
  type CreatePayoutInput,
  type NormalizedPayoutWebhookEvent,
  type NormalizedWebhookEvent,
  type PaymentPort,
  type PaymentStatus,
  type PayoutResult,
  type PayoutStatus,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';

/** Injectable fetch surface so tests run with ZERO network (T-060). */
export type WompiFetch = typeof fetch;

/** Response shape of `POST /v1/payment_links` (fields we depend on). */
interface WompiPaymentLinkCreated {
  data: { id: string };
}

/** Response shape of `GET /v1/payment_links/:id` (fields we depend on). */
interface WompiPaymentLinkFetched {
  data: {
    id: string;
    // Best-effort: Wompi's public docs do not fully specify whether/how a
    // payment link exposes its associated transactions here. If present, the
    // MOST RECENT transaction's status is authoritative; if absent, an unused
    // link is still 'pending'. TODO(validate against the real sandbox, T-060
    // manual step): confirm this shape with real credentials.
    transactions?: Array<{ status?: string; created_at?: string }>;
  };
}

/** The transaction sub-object Wompi embeds in a `transaction.updated` webhook. */
interface WompiWebhookTransaction {
  id?: string;
  status?: string;
  payment_link_id?: string | null;
  [key: string]: unknown;
}

/** Shape of a Wompi webhook event body (fields we depend on). */
interface WompiWebhookPayload {
  event?: string;
  data?: { transaction?: WompiWebhookTransaction };
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number;
}

/** Response shape of `POST /v1/payouts` (fields we depend on). */
interface WompiPayoutCreated {
  data: { id: string; status?: string };
}

/** The payout sub-object Wompi embeds in a payout confirmation webhook.
 *  TODO(validate against the real sandbox, M15b manual step): confirmed the
 *  event/field names against the public Payouts docs at write time; the
 *  real sandbox credentials are needed to verify the exact shape (same
 *  caveat already documented on `WompiPaymentLinkFetched` for collections). */
interface WompiWebhookPayout {
  id?: string;
  status?: string;
  [key: string]: unknown;
}

/** Shape of a Wompi payout webhook event body (fields we depend on). */
interface WompiPayoutWebhookPayload {
  event?: string;
  data?: { payout?: WompiWebhookPayout };
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number;
}

/** Wompi transaction status strings → our PaymentStatus (unknown ⇒ 'error'). */
const WOMPI_STATUS_MAP: Record<string, PaymentStatus> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
  VOIDED: 'voided',
  ERROR: 'error',
};

function mapWompiStatus(raw: string | undefined): PaymentStatus {
  return (raw && WOMPI_STATUS_MAP[raw]) || 'error';
}

/** Wompi payout status strings → our PayoutStatus. */
const WOMPI_PAYOUT_STATUS_MAP: Record<string, PayoutStatus> = {
  PENDING: 'scheduled',
  IN_PROGRESS: 'scheduled',
  PAID: 'paid',
  FAILED: 'failed',
  REJECTED: 'failed',
};

/** Used for `POST /payouts` responses: an unrecognized/absent status still
 *  means the payout was ACCEPTED (the call itself succeeded) ⇒ 'scheduled'. */
function mapWompiPayoutCreatedStatus(raw: string | undefined): PayoutStatus {
  return (raw && WOMPI_PAYOUT_STATUS_MAP[raw]) || 'scheduled';
}

/** Used for webhook EVENTS: an unrecognized status is fail-safe ⇒ 'failed'
 *  (never silently treated as a successful confirmation). */
function mapWompiPayoutWebhookStatus(raw: string | undefined): PayoutStatus {
  return (raw && WOMPI_PAYOUT_STATUS_MAP[raw]) || 'failed';
}

/**
 * Integer COP pesos → integer cents, as Wompi's `amount_in_cents` expects.
 * Pesos are ALWAYS integers (RNF12); this conversion is exact (no float drift)
 * because `pesos * 100` stays a safe integer for any realistic COP amount.
 */
export function pesosToCents(pesos: number): number {
  if (!Number.isInteger(pesos) || pesos <= 0) {
    throw new RangeError('pesos must be a positive integer number of COP pesos');
  }
  return pesos * 100;
}

/** Resolve a dot-separated path (e.g. "transaction.id") against an object. */
function resolvePath(source: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
      source,
    );
}

/**
 * Real Wompi {@link PaymentPort} adapter (T-060, M15a) — recaudo ONLY, via
 * Payment Links (agreed with Sebastián over the Widget/Checkout flow: it fits a
 * backend-initiated collection and keeps campaign funding, T-055, on the SAME
 * PaymentPort surface). Credentials come EXCLUSIVELY from env (`WOMPI_*`) —
 * NEVER hardcoded, never logged. Selected when `PAYMENT_DRIVER=wompi`; the fake
 * adapter stays the default and is UNCHANGED by this file.
 *
 * `computeBreakdown` remains the single source of the commission math — this
 * adapter only turns that breakdown into a Wompi payment link and back; it
 * never recomputes fees.
 *
 * Scope: {@link createCollection}/{@link getCollectionStatus}/
 * {@link verifyAndNormalizeWebhook} are the recaudo side (M15a, T-060).
 * {@link createPayout}/{@link verifyAndNormalizePayoutWebhook} are dispersión
 * T+1 (M15b) — real `POST /payouts` against the org's registered bank
 * account; the batch `/payouts/file` mode is an explicit `TODO(client)`, not
 * implemented (see {@link createPayout}'s doc).
 */
@Injectable()
export class WompiPaymentAdapter implements PaymentPort {
  private readonly logger = new Logger('WompiPaymentAdapter');
  private readonly baseUrl: string;
  private readonly privateKey: string;
  private readonly eventsSecret: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly fetchFn: WompiFetch = globalThis.fetch.bind(globalThis),
  ) {
    // Non-null: env validation (fail-fast, T-060) guarantees these when
    // PAYMENT_DRIVER=wompi.
    this.baseUrl = (config.get('WOMPI_BASE_URL', { infer: true }) as string).replace(/\/$/, '');
    this.privateKey = config.get('WOMPI_PRIVATE_KEY', { infer: true }) as string;
    this.eventsSecret = config.get('WOMPI_EVENTS_SECRET', { infer: true }) as string;
  }

  /**
   * Create a Payment Link for the collection. The reference is DERIVED from
   * the caller's `idempotencyKey` (`af-<key>`): the same key always produces
   * the same reference, and Wompi itself rejects a reused reference — so a
   * retry with the same key can never create a second link. `breakdown` is
   * computed HERE (the single source) and returned verbatim; only its
   * `amountCharged` is sent to Wompi, converted to cents.
   */
  async createCollection(input: CreateCollectionInput): Promise<CollectionResult> {
    const breakdown = computeBreakdown(input.intendedAmount, input.commissionPayer);
    const reference = `af-${input.idempotencyKey}`;

    const response = await this.fetchFn(`${this.baseUrl}/payment_links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.privateKey}`,
      },
      body: JSON.stringify({
        name: `AdoptaFácil — ${input.concept.kind}`,
        description: `Recaudo AdoptaFácil (${input.concept.kind}/${input.concept.id})`,
        single_use: true,
        collect_shipping: false,
        currency: input.currency,
        amount_in_cents: pesosToCents(breakdown.amountCharged),
        reference,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Wompi payment_links create failed (${response.status}): ${body}`);
    }

    const body = (await response.json()) as WompiPaymentLinkCreated;
    this.logger.log(`payment link created id=${body.data.id} reference=${reference}`);
    return { collectionId: body.data.id, status: 'pending', breakdown };
  }

  /**
   * Best-effort status lookup by re-fetching the payment link. The webhook is
   * the AUTHORITATIVE settlement path (`verifyAndNormalizeWebhook`); this is a
   * secondary, on-demand query with no current caller in the codebase.
   */
  async getCollectionStatus(collectionId: string): Promise<PaymentStatus> {
    const response = await this.fetchFn(`${this.baseUrl}/payment_links/${collectionId}`, {
      headers: { Authorization: `Bearer ${this.privateKey}` },
    });
    if (!response.ok) {
      throw new Error(`Wompi payment_links status failed (${response.status})`);
    }
    const body = (await response.json()) as WompiPaymentLinkFetched;
    const transactions = body.data.transactions ?? [];
    if (transactions.length === 0) {
      return 'pending'; // link exists, not yet paid
    }
    const latest = transactions[transactions.length - 1];
    return mapWompiStatus(latest.status);
  }

  /**
   * Verify a Wompi `transaction.updated` event and normalize it. The checksum
   * is SHA-256(hex) of: the values named in `signature.properties` (resolved
   * against `data`, in order) + `timestamp` + `WOMPI_EVENTS_SECRET` — compared
   * against `signature.checksum` (Wompi docs, §Eventos). An invalid/missing
   * signature is REJECTED (thrown), never processed.
   *
   * `collectionId` is `transaction.payment_link_id` — present because every
   * collection we create IS a Payment Link (never the Widget/Checkout flow).
   * `eventId`/`dedupKey` are `<transaction.id>-<status>`: Wompi's webhook body
   * has no separate event-id field, but this pair is stable for a REPEATED
   * delivery of the same event and distinct for a genuine status transition
   * (e.g. pending → approved), which is exactly the dedup granularity
   * `apply_donation_webhook` needs.
   */
  verifyAndNormalizeWebhook(payload: unknown, _signature: string): NormalizedWebhookEvent {
    const body = payload as WompiWebhookPayload;
    this.verifyChecksum(body.signature, body.timestamp, body.data);

    const transaction = body.data?.transaction;
    const collectionId = transaction?.payment_link_id;
    if (!collectionId) {
      throw new Error('Wompi webhook rejected: transaction has no payment_link_id.');
    }

    const status = mapWompiStatus(transaction?.status);
    const eventId = `${transaction?.id}-${transaction?.status}`;
    return { eventId, collectionId, status, dedupKey: eventId };
  }

  /**
   * Real Wompi Payouts adapter (M15b): dispersión T+1 directa a la cuenta
   * bancaria REGISTRADA de la organización (`input.bankAccount`) — nunca a un
   * saldo intermedio propio de la plataforma (invariante "no custodia"). El
   * `reference` se deriva del `idempotencyKey` (mismo patrón que
   * `createCollection`): un reintento con la misma clave nunca disperse dos
   * veces, porque Wompi rechaza una referencia repetida.
   *
   * Alcance (Consolidación operativa §4): solo el payout INDIVIDUAL
   * (`POST /payouts`). El modo por lote (`POST /payouts/file`, multipart) NO
   * se implementa aquí — su formato exacto no está verificado contra la API
   * real y el documento base no lo exige para operar; queda como
   * `TODO(client)` explícito en vez de inventarlo.
   */
  async createPayout(input: CreatePayoutInput): Promise<PayoutResult> {
    const reference = `af-payout-${input.idempotencyKey}`;
    const { bankAccount } = input;

    const response = await this.fetchFn(`${this.baseUrl}/payouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.privateKey}`,
      },
      body: JSON.stringify({
        reference,
        amount_in_cents: pesosToCents(input.amount),
        currency: 'COP',
        description: `Dispersión AdoptaFácil — ${input.beneficiaryOrgId}`,
        bank_account: {
          type: bankAccount.accountType === 'savings' ? 'SAVINGS' : 'CHECKING',
          number: bankAccount.accountNumber,
          bank_code: bankAccount.bankCode,
          holder_name: bankAccount.accountHolderName,
          holder_document_number: bankAccount.accountHolderDocument,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Wompi payouts create failed (${response.status}): ${body}`);
    }

    const body = (await response.json()) as WompiPayoutCreated;
    this.logger.log(`payout created id=${body.data.id} reference=${reference}`);
    return {
      payoutId: body.data.id,
      status: mapWompiPayoutCreatedStatus(body.data.status),
    };
  }

  /**
   * Verify a Wompi payout-confirmation webhook and normalize it. Same checksum
   * scheme as {@link verifyAndNormalizeWebhook} (Wompi signs every event the
   * same way regardless of kind) — reused via {@link verifyChecksum}.
   * `eventId`/`dedupKey` mirror the collection webhook's `<id>-<status>` pair.
   */
  verifyAndNormalizePayoutWebhook(
    payload: unknown,
    _signature: string,
  ): NormalizedPayoutWebhookEvent {
    const body = payload as WompiPayoutWebhookPayload;
    this.verifyChecksum(body.signature, body.timestamp, body.data);

    const payout = body.data?.payout;
    if (!payout?.id) {
      throw new Error('Wompi payout webhook rejected: payload has no payout.id.');
    }

    const status = mapWompiPayoutWebhookStatus(payout.status);
    const eventId = `${payout.id}-${payout.status}`;
    return { eventId, payoutId: payout.id, status, dedupKey: eventId };
  }

  /**
   * Shared checksum verification (Wompi docs, §Eventos): SHA-256(hex) of the
   * values named in `signature.properties` (resolved against `data`, in
   * order) + `timestamp` + `WOMPI_EVENTS_SECRET`, compared against
   * `signature.checksum`. Throws on any missing/mismatched piece — used by
   * BOTH the collection and payout webhook verifiers, since Wompi signs every
   * event type with the same scheme.
   */
  private verifyChecksum(
    signature: { properties?: string[]; checksum?: string } | undefined,
    timestamp: number | undefined,
    data: unknown,
  ): void {
    const properties = signature?.properties;
    const checksum = signature?.checksum;

    if (!properties?.length || !checksum || timestamp === undefined) {
      throw new Error('Wompi webhook rejected: missing signature/timestamp.');
    }

    const values = properties.map((path) => {
      const value = resolvePath(data, path);
      if (value === undefined || value === null) {
        throw new Error(`Wompi webhook rejected: signature property "${path}" is missing.`);
      }
      return String(value);
    });

    const concatenated = `${values.join('')}${timestamp}${this.eventsSecret}`;
    const computed = createHash('sha256').update(concatenated).digest('hex');

    if (computed !== checksum) {
      throw new Error('Wompi webhook rejected: checksum mismatch.');
    }
  }
}
