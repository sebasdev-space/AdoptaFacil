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

/** Response shape of `POST /v1/orders` and `GET /v1/orders/:id` (fields we
 *  depend on) — verified empirically (live curl, 2026-09-30) against
 *  production with a deliberately-invalid card token (no real charge). Both
 *  calls return the SAME top-level shape (MercadoPago's Orders reference doc
 *  confirms `GET` mirrors `POST`'s response). `transactions.payments[]` also
 *  carries a PER-PAYMENT status (can differ transiently per leg); this
 *  adapter deliberately reads only the ORDER's own top-level `status` — the
 *  overall/rollup outcome — never the nested one. */
interface MercadoPagoOrderFetched {
  id: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  // Read ONLY for diagnostic logging (e.g. 'rejected_by_issuer') — the
  // order's own top-level `status_detail` above is uninformative on a
  // decline (verified live, 2026-10-01: it just duplicates `status`, e.g.
  // both 'failed'). Never used for status mapping — that stays the order's
  // own rollup status, per this interface's own doc comment.
  transactions?: { payments?: Array<{ status_detail?: string }> };
}

/** Response shape of `GET /v1/payments/search` (fields we depend on). */
interface MercadoPagoPaymentSearchResponse {
  results?: Array<{ status?: string; external_reference?: string }>;
}

/**
 * A non-2xx `POST /v1/orders` response wraps its (still usable) order under
 * `data` (verified live, 2026-10-01, a 402 `rejected_by_issuer` decline) —
 * returns it when recognizable, `undefined` for a genuinely structural error
 * (malformed JSON, or no usable order in the body) so the caller knows to
 * throw instead.
 */
function parseDeclinedOrder(responseText: string): MercadoPagoOrderFetched | undefined {
  let parsed: { data?: MercadoPagoOrderFetched };
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return undefined;
  }
  const order = parsed.data;
  return order?.external_reference && order?.status ? order : undefined;
}

/** MercadoPago Orders status strings → our PaymentStatus (unknown ⇒ 'error',
 *  fail-safe — an unrecognized status is NEVER treated as a success).
 *  TODO(validar contra el sandbox real una vez MercadoPago habilite acceso de
 *  pruebas — 'processed'/'failed' están confirmados empíricamente (curl
 *  2026-09-30); 'pending'/'action_required'/'canceled' son del catálogo
 *  documentado de MercadoPago pero no se han visto en vivo todavía). */
const MERCADOPAGO_ORDER_STATUS_MAP: Record<string, PaymentStatus> = {
  processed: 'approved',
  pending: 'pending',
  action_required: 'pending',
  failed: 'declined',
  canceled: 'voided',
  cancelled: 'voided',
};

function mapMercadoPagoOrderStatus(raw: string | undefined): PaymentStatus {
  return (raw && MERCADOPAGO_ORDER_STATUS_MAP[raw]) || 'error';
}

/** Same status catalog as {@link MERCADOPAGO_ORDER_STATUS_MAP} but for the
 *  OLD `/v1/payments/search` results `getCollectionStatus` still queries
 *  (unchanged by T-OrdersAPI — see that method's doc comment for why). */
const MERCADOPAGO_PAYMENT_STATUS_MAP: Record<string, PaymentStatus> = {
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

function mapMercadoPagoPaymentStatus(raw: string | undefined): PaymentStatus {
  return (raw && MERCADOPAGO_PAYMENT_STATUS_MAP[raw]) || 'error';
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
 * was FULLY replaced by MercadoPago (client decision, no coexistence).
 * Credentials come EXCLUSIVELY from env (`MERCADOPAGO_*`) — NEVER hardcoded,
 * never logged. Selected when `PAYMENT_DRIVER=mercadopago`; the fake adapter
 * stays the default and is UNCHANGED by this file.
 *
 * T-OrdersAPI (2026-09-30, client decision): {@link createCollection} was
 * REWRITTEN from Checkout Pro (`POST /checkout/preferences`, a hosted
 * redirect page) to the Checkout API's Orders endpoint (`POST /v1/orders`) —
 * the card form is embedded on our own site (MercadoPago's Card Payment
 * Brick, frontend) and tokenized client-side; this adapter only ever sees the
 * resulting opaque token, never a card number. There is NO redirect/checkout
 * link in this model — `back_urls`/`auto_return`/`notification_url` (a
 * per-request override) are GONE; MercadoPago notifies this app's
 * `/donations/webhook` based on the ACCOUNT-level webhook config in the
 * MercadoPago dashboard (Your integrations → Webhooks → "Order" event) —
 * configuring that dashboard setting is an operational step outside this
 * codebase. `CollectionResult.paymentLinkUrl` is simply absent now (always
 * optional on the contract already).
 *
 * Split de Pagos 1:1 (T-OAuth-Connect): when the calling service resolves a
 * `sponsorMpUserId` (the beneficiary org's own connected MercadoPago
 * account), this adapter includes `integration_data.sponsor.id` so 100% of
 * the charge routes directly to that account via MercadoPago's own split
 * mechanism — see {@link createCollection}'s body for the commission
 * TODO(client): no fee field exists in the Orders API as of this task.
 *
 * `computeBreakdown` remains the single source of the commission math — this
 * adapter only turns that breakdown into a MercadoPago order and back; it
 * never recomputes fees.
 *
 * IMPORTANT: like the retired Checkout Pro path, every amount sent is in
 * PESOS as a STRING (`"50000"`, never `50000` or cents) — verified
 * empirically (live curl, 2026-09-30) against the real production API.
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
  }

  /**
   * Create a MercadoPago Order (Checkout API) for the collection — T-OrdersAPI.
   * `collectionId` is OUR OWN reference (`af-<idempotencyKey>`), never
   * MercadoPago's order id — an opaque key we define and look up later
   * (unique `donations.collection_id` column), same convention the retired
   * Checkout Pro path already used. `breakdown` is computed HERE (the single
   * source) and returned verbatim; every amount is sent in PESOS, as a
   * STRING (never cents, never a bare number — verified empirically).
   *
   * REQUIRES `input.cardToken` + `input.paymentMethodId` (the frontend's Card
   * Payment Brick tokenizes the card client-side; this adapter never sees a
   * card number) — throws a clear, caught-by-the-caller error without them
   * rather than attempting a request MercadoPago would reject anyway. Callers
   * with no user present to supply a card (the sponsorship recurring-billing
   * cron, `SponsorshipBillingService` — see its own doc comment) must not
   * call this method against the REAL driver; the fake adapter has no such
   * requirement (dev/test double, never calls a real gateway).
   */
  async createCollection(input: CreateCollectionInput): Promise<CollectionResult> {
    const breakdown = computeBreakdown(input.intendedAmount, input.commissionPayer);
    const reference = `af-${input.idempotencyKey}`;

    if (!input.cardToken || !input.paymentMethodId) {
      throw new Error(
        'MercadoPagoPaymentAdapter.createCollection requires a tokenized card ' +
          '(cardToken + paymentMethodId) — Checkout API/Orders has no redirect ' +
          'fallback (T-OrdersAPI). No card was supplied for this charge.',
      );
    }

    const amount = String(breakdown.amountCharged);
    // Verified live, 2026-10-01 (two round trips): the Brick's
    // `payment_method_id` for a debit card comes back WITH a 'deb' prefix
    // (e.g. 'debmaster') and Orders API wants it kept exactly as-is — id and
    // `type` are a matched PAIR, not independent fields. `type: credit_card`
    // (the default, when the card is actually debit) made MercadoPago reject
    // the prefixed id ("must be one of 'amex'/'diners'/'master'/'visa'/
    // 'codensa'"); fixing only `type` and ALSO stripping the prefix flipped
    // the id to the wrong enum the other way ("must be one of 'debmaster'/
    // 'debvisa'"). The id is never transformed — only `type` is inferred from
    // its prefix, which is more reliable than the Brick's own credit/debit
    // callback data (already noted as inconsistent).
    const isDebit = input.paymentMethodId.startsWith('deb');
    const body: Record<string, unknown> = {
      type: 'online',
      external_reference: reference,
      transactions: {
        payments: [
          {
            amount,
            payment_method: {
              id: input.paymentMethodId,
              type: input.paymentMethodType ?? (isDebit ? 'debit_card' : 'credit_card'),
              token: input.cardToken,
              installments: input.installments ?? 1,
            },
          },
        ],
      },
      total_amount: amount,
      processing_mode: 'automatic',
    };
    if (input.payer?.email) {
      body.payer = { email: input.payer.email };
    }
    if (input.sponsorMpUserId) {
      // Split de Pagos 1:1 (T-OAuth-Connect). Verified empirically: this is
      // the ONLY valid location for `sponsor.id` (rejected when nested under
      // `transactions.payments[0]`), and it must be a DIFFERENT MercadoPago
      // account than the one issuing the request (self-sponsorship rejected
      // as `order_invalid_sponsor_id`).
      // TODO(client): no commission/fee field exists anywhere in the Orders
      // API as of this task — `marketplace_fee` (top-level) is silently
      // accepted but ignored/never echoed back; `application_fee` (nested in
      // a payment) and a `fee` nested in `sponsor` are both REJECTED as
      // unsupported (all verified via live curl, 2026-09-30). Until
      // MercadoPago support answers how a platform commission is taken on a
      // split order, 100% of `amountCharged` routes to the sponsor — moving
      // forward now is an explicit client decision, not an oversight.
      body.integration_data = { sponsor: { id: input.sponsorMpUserId } };
    }

    const response = await this.fetchFn(`${this.baseUrl}/v1/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        // REQUIRED by /v1/orders (verified live, 2026-09-30: 400
        // empty_required_header without it) — unlike the retired Checkout Pro
        // preferences endpoint, which took no idempotency header at all. Our
        // own idempotencyKey IS the idempotency key MercadoPago wants here,
        // so a retry with the same key is safely deduped on their side too.
        'X-Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    let resBody: MercadoPagoOrderFetched;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      // A card decline is a SUCCESSFUL API call from our perspective — the
      // order was created, the charge just failed (e.g. rejected_by_issuer).
      // Verified live, 2026-10-01: MercadoPago answers that case with a 402
      // and wraps the (still usable) order under a `data` key — a DIFFERENT
      // envelope than the plain top-level shape a 2xx response or
      // `GET /v1/orders/:id` use. Only when that recognizable order is absent
      // (a genuine structural/validation error, e.g. the missing-header 400)
      // do we throw — those have no collection to report a status for.
      const declinedOrder = parseDeclinedOrder(text);
      if (!declinedOrder) {
        throw new Error(`MercadoPago orders create failed (${response.status}): ${text}`);
      }
      resBody = declinedOrder;
    } else {
      resBody = (await response.json()) as MercadoPagoOrderFetched;
    }
    const paymentDetail = resBody.transactions?.payments?.[0]?.status_detail;
    this.logger.log(
      `order created id=${resBody.id} reference=${reference} status=${resBody.status}` +
        (paymentDetail ? ` payment_detail=${paymentDetail}` : ''),
    );

    // Some outcomes (approved/rejected) are often already terminal in the
    // create response itself (verified empirically); the webhook remains the
    // AUTHORITATIVE, idempotent confirmation path either way (an 'approved'
    // returned here still gets re-confirmed — harmlessly, dedup by event —
    // once MercadoPago's own notification arrives).
    return {
      collectionId: reference,
      status: mapMercadoPagoOrderStatus(resBody.status),
      breakdown,
      // No checkout link in this model (Checkout API/Orders embeds the card
      // form on our own site) — always absent now, see the class doc comment.
    };
  }

  /**
   * Best-effort status lookup by searching payments for our `external_reference`.
   * The webhook is the AUTHORITATIVE settlement path (`verifyAndNormalizeWebhook`);
   * this is a secondary, on-demand query — UNCHANGED by T-OrdersAPI, and kept
   * against the OLD `/v1/payments/search` endpoint on purpose: MercadoPago's
   * Orders API still creates real underlying Payment resources per
   * transaction (`GET /v1/orders/:id` nests them at `transactions.payments[]`,
   * each with its own `PAY...`-prefixed id — verified empirically), so this
   * search plausibly still resolves them by the SAME `external_reference` we
   * set at the order level — but that has NOT been verified end-to-end
   * against a real approved order (no real test card available, see the
   * caller's own notes). The sponsorship payment poller is the one caller
   * that depends on this (donations use the webhook instead).
   *
   * TODO(validar contra el sandbox real una vez haya una tarjeta de prueba —
   * si `/v1/payments/search` NO resuelve pagos creados vía Orders, esto
   * necesita su propio equivalente, p. ej. `GET /v1/orders/search`).
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
    return mapMercadoPagoPaymentStatus(results[0].status);
  }

  /**
   * Verify a MercadoPago Orders webhook notification and normalize it
   * (T-OrdersAPI). MercadoPago sends a dedicated `order` topic/type for
   * Checkout API/Orders (configured per-app in the MercadoPago dashboard,
   * Your integrations → Webhooks → "Order" event) — distinct from the OLD
   * `payment` topic the retired Checkout Pro path used, but carrying `data.id`
   * the SAME way (here, the ORDER's own id, `ORD...`-prefixed, not a payment
   * id). The `x-signature` header's `ts`/`v1` HMAC-SHA256 scheme is
   * documented platform-wide (not re-derived on MercadoPago's Orders-specific
   * notifications page) — reused here UNCHANGED; TODO(validar contra el
   * sandbox real en cuanto MercadoPago habilite acceso de pruebas: confirmar
   * que el manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` sigue
   * siendo IDÉNTICO para notificaciones de tipo `order`). The webhook BODY
   * never carries the final status — only the order id — so a SEPARATE
   * `GET /v1/orders/:id` call resolves it, reading the ORDER's own top-level
   * `status` (never the nested per-payment one — see
   * `MercadoPagoOrderFetched`'s doc comment). An invalid/missing signature or
   * lookup failure is REJECTED (thrown), never processed.
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

    const response = await this.fetchFn(`${this.baseUrl}/v1/orders/${dataId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`MercadoPago order fetch failed (${response.status})`);
    }
    const order = (await response.json()) as MercadoPagoOrderFetched;
    if (!order.external_reference) {
      throw new Error('MercadoPago webhook rejected: order has no external_reference.');
    }

    const status = mapMercadoPagoOrderStatus(order.status);
    const eventId = `${dataId}-${order.status}`;
    return { eventId, collectionId: order.external_reference, status, dedupKey: eventId };
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
