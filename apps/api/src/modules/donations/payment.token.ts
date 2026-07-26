import type { PaymentPort } from '@adoptafacil/contracts';

/**
 * DI token for the money-engine port CONSUMED by M05.
 *
 * TODO(core): el token GLOBAL `PAYMENT_PORT` (con el @Global module que enlaza el
 * adapter real de Wompi / el FakePaymentAdapter) es tarea de Sebastián en core/.
 * Mientras no exista, M05 enlaza el `FakePaymentAdapter` de `@adoptafacil/contracts`
 * a ESTE token LOCAL (ver donations.module.ts) — NO se toca core/. Cuando el token
 * global aterrice, basta reemplazar este símbolo por el import de core y borrar el
 * provider local; el service (que inyecta el token) no cambia.
 */
export const PAYMENT_PORT = Symbol('DONATIONS_PAYMENT_PORT');

export type { PaymentPort };
