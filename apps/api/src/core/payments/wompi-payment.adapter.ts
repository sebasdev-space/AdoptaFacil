import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  computeBreakdown,
  type CollectionResult,
  type CreateCollectionInput,
  type CreatePayoutInput,
  type NormalizedWebhookEvent,
  type PaymentPort,
  type PaymentStatus,
  type PayoutResult,
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
 * Scope (M15a): {@link createCollection}, {@link getCollectionStatus},
 * {@link verifyAndNormalizeWebhook}. {@link createPayout} (dispersión T+1) is
 * M15b — this adapter throws for it, same "not implemented yet" pattern the
 * PaymentModule already uses for the whole driver today.
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
    const properties = body?.signature?.properties;
    const checksum = body?.signature?.checksum;
    const timestamp = body?.timestamp;

    if (!properties?.length || !checksum || timestamp === undefined) {
      throw new Error('Wompi webhook rejected: missing signature/timestamp.');
    }

    const values = properties.map((path) => {
      const value = resolvePath(body.data, path);
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

    const transaction = body.data?.transaction;
    const collectionId = transaction?.payment_link_id;
    if (!collectionId) {
      throw new Error('Wompi webhook rejected: transaction has no payment_link_id.');
    }

    const status = mapWompiStatus(transaction?.status);
    const eventId = `${transaction?.id}-${transaction?.status}`;
    return { eventId, collectionId, status, dedupKey: eventId };
  }

  /** Dispersión T+1 — OUT OF SCOPE for M15a (T-060). M15b implements this. */
  async createPayout(_input: CreatePayoutInput): Promise<PayoutResult> {
    throw new Error('WompiPaymentAdapter.createPayout is not implemented yet (M15b).');
  }
}
