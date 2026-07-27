/**
 * DI token for the PaymentPort (T-052). The PORT INTERFACE, the fee math
 * (`computeBreakdown`) and the `FakePaymentAdapter` are Fabián's contract-first
 * work in `@adoptafacil/contracts` (payments.ts, T-040) — imported, never copied.
 * This file only owns the injection SYMBOL so every business module (donations,
 * M06, M07) injects the port by the SAME token and the real Wompi adapter (M15)
 * is swapped in ONE place (PaymentModule) without touching any consumer.
 *
 * Consumers: `@Inject(PAYMENT_PORT) private readonly payments: PaymentPort` where
 * `PaymentPort` is the type imported from `@adoptafacil/contracts`.
 */
export const PAYMENT_PORT = Symbol('PAYMENT_PORT');
