/** BullMQ queue + job name for the MercadoPago token-refresh worker
 *  (T-OAuth-Connect) — same shape as `sponsorship-billing.constants.ts` /
 *  `reminders.constants.ts`: a repeatable job self-registered via
 *  `onModuleInit`, running on the shared global BullMQ↔Redis connection
 *  (QueueModule). */
export const MERCADOPAGO_TOKEN_REFRESH_QUEUE = 'mercadopago-token-refresh';
export const MERCADOPAGO_TOKEN_REFRESH_JOB = 'refresh';

/** Claims encoded in the `state` param round-tripped through MercadoPago's
 *  OAuth redirect (`GET /org/mercadopago/connect` signs it, `GET
 *  /org/mercadopago/callback` verifies it). The connect endpoint is
 *  authenticated (knows the org from the JWT), but the callback is
 *  necessarily PUBLIC (a browser redirect carries no Authorization header) —
 *  this signed, short-lived JWT IS the state store, so no extra DB table is
 *  needed just to track a pending connect attempt. `nonce` gives each
 *  authorize URL a unique value (defense in depth against token reuse/replay
 *  beyond what `exp` already buys). */
export interface MercadoPagoConnectStateClaims {
  organizationId: string;
  nonce: string;
}

/** 10 minutes — matches MercadoPago's own authorization-code validity window
 *  (verified live), so the state token never outlives the code it protects. */
export const MERCADOPAGO_CONNECT_STATE_TTL_SECONDS = 10 * 60;
