import { useEffect, useRef, useState } from 'react';
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import styles from './card-payment-brick.module.scss';

/**
 * MercadoPago's Card Payment Brick (T-OrdersAPI) — embeds a card form on our
 * own site and tokenizes it CLIENT-SIDE (the card number never reaches our
 * backend; only the resulting opaque `token` does). Shared between donations
 * (`DonateForm`) and sponsorships (`MySponsorshipsList`'s "Pagar de nuevo")
 * since both now charge via the same Checkout API/Orders mechanism — this
 * component only wraps the SDK; it never decides WHAT the charge is for.
 *
 * `initMercadoPago` is called ONCE per public key (module-level guard) — the
 * SDK itself is a singleton; calling it again with the SAME key is harmless
 * but pointless, and this component can mount more than once across a
 * session (e.g. donating twice).
 */
let initializedForKey: string | undefined;

function ensureInitialized(publicKey: string): void {
  if (initializedForKey === publicKey) return;
  initMercadoPago(publicKey, { locale: 'es-CO' });
  initializedForKey = publicKey;
}

/** What the caller gets once the Brick has tokenized a real card. Mirrors
 *  `CreateCollectionInput`'s card fields (packages/contracts/src/payments.ts)
 *  verbatim — this is the ONLY place in the frontend that talks to the SDK;
 *  everything downstream (DonatePage, MySponsorshipsList) just forwards this
 *  shape straight into the existing `POST /donations` / `retry-payment` call. */
export interface CardPaymentBrickResult {
  cardToken: string;
  paymentMethodId: string;
  /**
   * MercadoPago Orders requires credit_card/debit_card. The Brick's
   * `onSubmit` callback does not reliably surface it (verified against the
   * installed SDK's own type declarations, T-OrdersAPI) — this is therefore
   * always `undefined` from here; the backend adapter defaults to
   * 'credit_card' when absent (see `MercadoPagoPaymentAdapter.createCollection`'s
   * own TODO(client)).
   */
  paymentMethodType?: 'credit_card' | 'debit_card';
  installments: number;
}

export interface CardPaymentBrickProps {
  /** Integer COP pesos — the Brick shows/validates against this amount. */
  amount: number;
  /** Pre-fills the payer email in the Brick's own form when known
   *  (authenticated donor/sponsor); omitted for a guest, who types it in. */
  payerEmail?: string;
  /**
   * Called once the Brick has tokenized a real card. ASYNC on purpose: the
   * Brick awaits this promise and shows its OWN loading/success/error state
   * tied to it — the caller does the actual `POST` here and throws on
   * failure (declined/network/validation) so the Brick surfaces that error
   * inline instead of this component inventing its own duplicate UI for it.
   */
  onResult: (result: CardPaymentBrickResult) => Promise<void>;
}

/**
 * Renders MercadoPago's Card Payment Brick, or an explanatory message when
 * `VITE_MERCADOPAGO_PUBLIC_KEY` is unset (dev/test default — PAYMENT_DRIVER=fake
 * needs no real card either way, same reasoning as `GoogleSignInButton`'s
 * "Continuar con Google (prueba)" fallback for `VITE_GOOGLE_CLIENT_ID`).
 */
export function CardPaymentBrick({ amount, payerEmail, onResult }: CardPaymentBrickProps) {
  const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY;
  const [error, setError] = useState<string | null>(null);
  // `amount` is read once at mount (the Brick's own `useCardPaymentBrick().update`
  // hook is for LIVE amount changes after render — not needed here: the
  // amount is already final/locked by the time this component mounts, see
  // DonateForm's two-step flow). A ref avoids re-creating the brick in case a
  // parent re-render passes a referentially-new but value-equal amount.
  const amountRef = useRef(amount);

  useEffect(() => {
    if (publicKey) ensureInitialized(publicKey);
  }, [publicKey]);

  if (!publicKey) {
    return (
      <p className={styles.unavailable} data-testid="card-brick-unavailable">
        Pago con tarjeta no disponible en este entorno (falta configuración de MercadoPago).
      </p>
    );
  }

  return (
    <div className={styles.container} data-testid="card-payment-brick">
      {error && (
        <p className={styles['hint--error']} data-testid="card-brick-error">
          {error}
        </p>
      )}
      <CardPayment
        initialization={{
          amount: amountRef.current,
          payer: payerEmail ? { email: payerEmail } : undefined,
        }}
        onSubmit={async (formData) => {
          setError(null);
          try {
            await onResult({
              cardToken: formData.token,
              paymentMethodId: formData.payment_method_id,
              installments: formData.installments,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo procesar el pago.';
            setError(message);
            // Re-throw: the Brick's own onSubmit contract expects a rejected
            // promise to show ITS error state too (belt & suspenders — ours
            // above is the one guaranteed to render regardless of the
            // Brick's internal error-state wiring for a given failure type).
            throw err;
          }
        }}
        onError={(brickError) => setError(brickError.message || 'Error al procesar la tarjeta.')}
      />
      <p className={styles.hint}>
        Tu tarjeta se procesa de forma segura con MercadoPago — AdoptaFácil nunca ve ni almacena su
        número.
      </p>
    </div>
  );
}
