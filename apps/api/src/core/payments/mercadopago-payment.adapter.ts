import { createHmac, timingSafeEqual } from 'node:crypto';
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
  type WebhookVerificationContext,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';

/** Injectable fetch surface so tests run with ZERO network. */
export type MercadoPagoFetch = typeof fetch;

/** Response shape of `POST /checkout/preferences` (fields we depend on). */
interface MercadoPagoPreferenceCreated {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
}

/** Response shape of `GET /v1/payments/search` (fields we depend on). */
interface MercadoPagoPaymentSearchResponse {
  results?: Array<{ status?: string; external_reference?: string }>;
}

/** Response shape of `GET /v1/payments/:id` (fields we depend on). */
interface MercadoPagoPaymentFetched {
  status?: string;
  external_reference?: string;
}

/** MercadoPago payment status strings → our PaymentStatus (unknown ⇒ 'error',
 *  fail-safe — an unrecognized status is NEVER treated as a success). */
const MERCADOPAGO_STATUS_MAP: Record<string, PaymentStatus> = {
  approved: 'approved',
  pending: 'pending',
  authorized: 'pending',
  in_process: 'pending',
  in_mediation: 'pending',
  rejected: 'declined',
  cancelled: 'voided',
  refunded: 'voided',
  charged_back: 'voided',
};

function mapMercadoPagoStatus(raw: string | undefined): PaymentStatus {
  return (raw && MERCADOPAGO_STATUS_MAP[raw]) || 'error';
}

/**
 * Parse the literal `x-signature` header format MercadoPago sends:
 * `ts=1704908010,v1=618c853...`. Either piece can be absent from a malformed
 * or tampered header — the caller rejects when that happens.
 */
function parseSignatureHeader(signature: string | undefined): { ts?: string; v1?: string } {
  const result: { ts?: string; v1?: string } = {};
  for (const part of (signature ?? '').split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts') result.ts = value;
    if (key === 'v1') result.v1 = value;
  }
  return result;
}

/**
 * Constant-time hex comparison. Buffers of DIFFERENT length would make
 * `crypto.timingSafeEqual` throw instead of returning false — the length
 * check short-circuits that so a mismatched signature is simply "invalid",
 * never an unhandled exception.
 */
function timingSafeEqualHex(computedHex: string, givenHex: string): boolean {
  const computed = Buffer.from(computedHex, 'hex');
  const given = Buffer.from(givenHex, 'hex');
  if (computed.length !== given.length) {
    return false;
  }
  return timingSafeEqual(computed, given);
}

/**
 * Real MercadoPago {@link PaymentPort} adapter — recaudo ONLY (Fase 1). Wompi
 * was FULLY replaced by MercadoPago (client decision, no coexistence); this
 * adapter keeps the SAME business model — consolidated collection + MANUAL
 * T+1 payout — via Checkout Pro preferences, never MercadoPago's Marketplace
 * split. Credentials come EXCLUSIVELY from env (`MERCADOPAGO_*`) — NEVER
 * hardcoded, never logged. Selected when `PAYMENT_DRIVER=mercadopago`; the
 * fake adapter stays the default and is UNCHANGED by this file.
 *
 * `computeBreakdown` remains the single source of the commission math — this
 * adapter only turns that breakdown into a MercadoPago preference and back;
 * it never recomputes fees.
 *
 * IMPORTANT: unlike Wompi's `amount_in_cents`, MercadoPago's `unit_price` is
 * the amount in PESOS as-is (never multiplied by 100) — see {@link createCollection}.
 *
 * Scope: {@link createCollection}/{@link getCollectionStatus}/
 * {@link verifyAndNormalizeWebhook} are the recaudo side (Fase 1).
 * {@link createPayout}/{@link verifyAndNormalizePayoutWebhook} are dispersión
 * T+1 (Fase 2) — BLOCKED: MercadoPago must approve special "Disbursements"
 * permissions on the client's application before this can be implemented;
 * both throw "not implemented" (same posture the original WompiPaymentAdapter
 * had for `createPayout` before M15b existed).
 */
@Injectable()
export class MercadoPagoPaymentAdapter implements PaymentPort {
  private readonly logger = new Logger('MercadoPagoPaymentAdapter');
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly webhookSecret: string;
  private readonly publicBaseUrl: string | undefined;

  constructor(
    config: ConfigService<Env, true>,
    private readonly fetchFn: MercadoPagoFetch = globalThis.fetch.bind(globalThis),
  ) {
    // Non-null: env validation (fail-fast) guarantees these when
    // PAYMENT_DRIVER=mercadopago.
    this.baseUrl = (config.get('MERCADOPAGO_BASE_URL', { infer: true }) as string).replace(
      /\/$/,
      '',
    );
    this.accessToken = config.get('MERCADOPAGO_ACCESS_TOKEN', { infer: true }) as string;
    this.webhookSecret = config.get('MERCADOPAGO_WEBHOOK_SECRET', { infer: true }) as string;
    // Already exists in the env (StoragePort, "Base URL the API is reachable
    // at"); reused here so MercadoPago can call us back at /donations/webhook
    // without a new config knob. Optional in-code: if it's not resolvable
    // (e.g. a raw config object in a test), we simply omit `notification_url`
    // and rely on the account-level callback URL configured in the
    // MercadoPago dashboard instead.
    this.publicBaseUrl = config.get('STORAGE_PUBLIC_BASE_URL', { infer: true }) as
      string | undefined;
  }

  /**
   * Create a Checkout Pro preference for the collection. `collectionId` is
   * OUR OWN reference (`af-<idempotencyKey>`), never MercadoPago's preference
   * id — an opaque key we define and look up later (unique `donations.collection_id`
   * column), which makes resolving status trivial without mapping between
   * MercadoPago's id and ours. `breakdown` is computed HERE (the single
   * source) and returned verbatim; `unit_price` is sent in PESOS, NOT cents
   * (MercadoPago does not use `amount_in_cents` like Wompi did).
   */
  async createCollection(input: CreateCollectionInput): Promise<CollectionResult> {
    const breakdown = computeBreakdown(input.intendedAmount, input.commissionPayer);
    const reference = `af-${input.idempotencyKey}`;

    const body: Record<string, unknown> = {
      items: [
        {
          title: `AdoptaFácil — ${input.concept.kind}`,
          quantity: 1,
          unit_price: breakdown.amountCharged,
          currency_id: 'COP',
        },
      ],
      external_reference: reference,
    };
    if (this.publicBaseUrl) {
      body.notification_url = `${this.publicBaseUrl.replace(/\/$/, '')}/donations/webhook`;
    }

    const response = await this.fetchFn(`${this.baseUrl}/checkout/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `MercadoPago checkout/preferences create failed (${response.status}): ${text}`,
      );
    }

    const resBody = (await response.json()) as MercadoPagoPreferenceCreated;
    // The real MercadoPago preference id is logged ONLY — never returned as
    // `collectionId` (see method doc above).
    this.logger.log(`preference created id=${resBody.id} reference=${reference}`);

    return {
      collectionId: reference,
      status: 'pending',
      breakdown,
      paymentLinkUrl: resBody.init_point ?? resBody.sandbox_init_point,
    };
  }

  /**
   * Best-effort status lookup by searching payments for our `external_reference`.
   * The webhook is the AUTHORITATIVE settlement path (`verifyAndNormalizeWebhook`);
   * this is a secondary, on-demand query with no current caller in the codebase
   * (same as the Wompi adapter's equivalent method).
   *
   * TODO(validar contra el sandbox real, mismo criterio que ya usaba
   * wompi-payment.adapter.ts para su propio caso equivalente).
   */
  async getCollectionStatus(collectionId: string): Promise<PaymentStatus> {
    const url =
      `${this.baseUrl}/v1/payments/search?external_reference=${encodeURIComponent(collectionId)}` +
      `&sort=date_created&criteria=desc`;
    const response = await this.fetchFn(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`MercadoPago payments search failed (${response.status})`);
    }
    const body = (await response.json()) as MercadoPagoPaymentSearchResponse;
    const results = body.results ?? [];
    if (results.length === 0) {
      return 'pending'; // nobody has paid yet
    }
    return mapMercadoPagoStatus(results[0].status);
  }

  /**
   * Verify a MercadoPago webhook notification and normalize it. MercadoPago's
   * `x-signature` header carries `ts`/`v1` (HMAC-SHA256 hex of a manifest built
   * from `data.id` (lowercased) + `x-request-id` + `ts` + the webhook secret —
   * MercadoPago docs). Unlike Wompi, the webhook BODY never carries the
   * payment status — only an id — so a SEPARATE `GET /v1/payments/:id` call is
   * required to resolve it; that is why this method is `async` (contract
   * change, Fase 1). An invalid/missing signature or lookup failure is
   * REJECTED (thrown), never processed.
   */
  async verifyAndNormalizeWebhook(
    _payload: unknown,
    signature: string,
    context?: WebhookVerificationContext,
  ): Promise<NormalizedWebhookEvent> {
    const { ts, v1 } = parseSignatureHeader(signature);
    const requestId = context?.headers?.['x-request-id'];
    const dataId = context?.query?.['data.id'];

    if (!ts || !v1 || !requestId || !dataId || !this.webhookSecret) {
      throw new Error(
        'MercadoPago webhook rejected: missing ts/v1/x-request-id/data.id/webhook secret.',
      );
    }

    // MercadoPago docs: alphanumeric ids must be lowercased in the manifest.
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const computed = createHmac('sha256', this.webhookSecret).update(manifest).digest('hex');

    if (!timingSafeEqualHex(computed, v1)) {
      throw new Error('MercadoPago webhook rejected: signature mismatch.');
    }

    const response = await this.fetchFn(`${this.baseUrl}/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`MercadoPago payment fetch failed (${response.status})`);
    }
    const payment = (await response.json()) as MercadoPagoPaymentFetched;
    if (!payment.external_reference) {
      throw new Error('MercadoPago webhook rejected: payment has no external_reference.');
    }

    const status = mapMercadoPagoStatus(payment.status);
    const eventId = `${dataId}-${payment.status}`;
    return { eventId, collectionId: payment.external_reference, status, dedupKey: eventId };
  }

  /**
   * Dispersión T+1 (Fase 2) — BLOCKED. MercadoPago's "Disbursements" API
   * requires MercadoPago to grant special permissions on the client's
   * application first; until that approval lands, this stays unimplemented
   * (same posture the original WompiPaymentAdapter had for `createPayout`
   * before M15b existed).
   */
  async createPayout(_input: CreatePayoutInput): Promise<PayoutResult> {
    throw new Error(
      'MercadoPagoPaymentAdapter.createPayout is not implemented yet (Fase 2 — pendiente aprobación de Disbursements por MercadoPago)',
    );
  }

  /** See {@link createPayout} — same Fase 2 block. */
  async verifyAndNormalizePayoutWebhook(
    _payload: unknown,
    _signature: string,
    _context?: WebhookVerificationContext,
  ): Promise<NormalizedPayoutWebhookEvent> {
    throw new Error(
      'MercadoPagoPaymentAdapter.createPayout is not implemented yet (Fase 2 — pendiente aprobación de Disbursements por MercadoPago)',
    );
  }
}
