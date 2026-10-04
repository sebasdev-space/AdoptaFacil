import { useState } from 'react';
import { MIN_DONATION_AMOUNT, type CommissionPayer } from '@adoptafacil/contracts';
import { Button, Input, cn } from '@adoptafacil/ui';
import { CardPaymentBrick } from '../../payments';
import { DonationBreakdown } from './donation-breakdown';
import { formatCop, safeBuildDonationBreakdown } from '../model/donation-breakdown-view';
import styles from './donate-form.module.scss';

/** Regex de validación LIVIANA en UI — el backend (zod, `.email()`) es la
 *  autoridad real; esto solo evita habilitar "Continuar" con algo obviamente
 *  incompleto. */
const EMAIL_LOOKS_VALID = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DonateFormValues {
  intendedAmount: number;
  commissionPayer: CommissionPayer;
  /** "¿Donar de forma anónima frente a la organización?" */
  anonymous: boolean;
  /** Solo presente cuando NO hay sesión (checkout de invitado): el nombre y
   *  correo capturados en el propio formulario. Con sesión, `DonatePage`
   *  arma el payer desde `useSession()` — este formulario no lo duplica. */
  guestPayer?: { fullName: string; email: string };
  /**
   * Checkout API (Orders) — T-OrdersAPI. Tokenized card data from MercadoPago's
   * Card Payment Brick (step 2 of this form, below). The card number never
   * reaches this codebase — only this opaque, single-use token does.
   */
  cardToken: string;
  paymentMethodId: string;
  paymentMethodType?: 'credit_card' | 'debit_card';
  installments: number;
}

export interface DonateFormProps {
  organizationName: string;
  submitting?: boolean;
  /** Hay una sesión activa (Persona autenticada). `false` ⇒ checkout de
   *  invitado (requisito del cliente: donar nunca exige cuenta ni login) —
   *  el formulario pide nombre + correo y los exige antes de habilitar
   *  "Continuar". Con sesión, esos campos ni se muestran (se prellenan aparte). */
  hasSession: boolean;
  /** Email del donante autenticado, solo para prellenar el Brick (T-OrdersAPI)
   *  — presentacional, nunca se valida aquí (lo hace el backend). */
  sessionEmailHint?: string;
  /**
   * Llamado SOLO una vez el Card Payment Brick tokenizó una tarjeta real
   * (paso 2). Debe devolver una Promise: el Brick espera a que resuelva/
   * rechace para mostrar su propio estado de éxito/error — ver
   * `CardPaymentBrick`'s doc comment.
   */
  onDonate: (values: DonateFormValues) => Promise<void>;
}

type FormStep = 'details' | 'card';

/**
 * Formulario de donación (§M05, P1 + checkout de invitado + T-OrdersAPI). PRESENTACIONAL
 * (sin api/sesión real, recibe `hasSession` como prop) para poder testearlo directo.
 * DOS PASOS desde T-OrdersAPI (antes era un solo submit que confiaba en el redirect de
 * MercadoPago Checkout Pro, ya retirado):
 *   1. "details": monto + casillas + desglose transparente EN VIVO (misma cuenta que
 *      el backend, vía `computeBreakdown`) + identidad de invitado si no hay sesión.
 *      "Continuar" solo AVANZA de paso — no cobra nada todavía.
 *   2. "card": el monto YA ESTÁ DECIDIDO (se muestra, no editable); se embebe el Card
 *      Payment Brick (MercadoPago) para tokenizar una tarjeta real. Solo al enviar ESE
 *      formulario (botón propio del Brick) se llama a `onDonate` — con el token incluido.
 * Ofrece la casilla "cubro el apoyo de sostenimiento y la comisión de la pasarela"
 * (commissionPayer = 'donor'; F-NOMENCLATURA-CHECKBOX: extiende #100 al checkbox — el
 * donante cubre AMBOS componentes, el % que retiene AdoptaFácil (apoyo, no "comisión"
 * propia por indicación fiscal) y la comisión real de la pasarela de pago (tercero,
 * mantiene su nombre — MercadoPago).
 * Lo PRIMERO que se pregunta es si la donación es con datos o anónima FRENTE A LA
 * ORGANIZACIÓN (con o sin sesión). Sin sesión y con datos, se exige nombre + correo
 * (checkout de invitado); si elige anónima, esos campos se omiten por completo.
 */
export function DonateForm({
  organizationName,
  submitting = false,
  hasSession,
  sessionEmailHint,
  onDonate,
}: DonateFormProps) {
  const [step, setStep] = useState<FormStep>('details');
  const [amountText, setAmountText] = useState('');
  const [coverFee, setCoverFee] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  const commissionPayer: CommissionPayer = coverFee ? 'donor' : 'organization';
  const amount = Number.parseInt(amountText, 10);
  const preview = safeBuildDonationBreakdown(amount, commissionPayer);
  // Anónima: el invitado no entrega nombre ni correo (no se pide ni se envía).
  const askGuestIdentity = !hasSession && !anonymous;
  const guestIdentityComplete =
    !askGuestIdentity || (guestName.trim().length > 0 && EMAIL_LOOKS_VALID.test(guestEmail.trim()));
  const canContinue = preview !== null && !submitting && guestIdentityComplete;

  const guestPayer = askGuestIdentity
    ? { fullName: guestName.trim(), email: guestEmail.trim() }
    : undefined;
  const payerEmailForBrick = hasSession ? sessionEmailHint : guestPayer?.email;

  if (step === 'card' && preview) {
    return (
      <div className={styles.form}>
        <p className={styles.hint}>
          Donando <strong>{formatCop(preview.breakdown.amountCharged)}</strong> a {organizationName}
          .
        </p>
        <CardPaymentBrick
          amount={preview.breakdown.amountCharged}
          payerEmail={payerEmailForBrick}
          onResult={(card) =>
            onDonate({
              intendedAmount: amount,
              commissionPayer,
              anonymous,
              guestPayer,
              cardToken: card.cardToken,
              paymentMethodId: card.paymentMethodId,
              paymentMethodType: card.paymentMethodType,
              installments: card.installments,
            })
          }
        />
        <Button
          variant="outline"
          disabled={submitting}
          onClick={() => setStep('details')}
          data-testid="donate-back-to-details"
        >
          Volver
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <fieldset className={styles.choice}>
        <legend className={styles.label}>¿Cómo quieres donar?</legend>
        <div className={styles.choice__options}>
          <label
            className={cn(styles.choice__option, !anonymous && styles['choice__option--selected'])}
          >
            <input
              type="radio"
              name="donation-visibility"
              className={styles.choice__input}
              checked={!anonymous}
              data-testid="donate-identified"
              onChange={() => setAnonymous(false)}
            />
            <span className={styles.choice__title}>Con mis datos</span>
            <span className={styles.choice__desc}>
              La organización sabrá quién dona y recibirás tu recibo por correo.
            </span>
          </label>
          <label
            className={cn(styles.choice__option, anonymous && styles['choice__option--selected'])}
          >
            <input
              type="radio"
              name="donation-visibility"
              className={styles.choice__input}
              checked={anonymous}
              data-testid="donate-anonymous"
              onChange={() => setAnonymous(true)}
            />
            <span className={styles.choice__title}>De forma anónima</span>
            <span className={styles.choice__desc}>
              La organización no verá tu identidad.
              {!hasSession && ' No te pediremos nombre ni correo, y no recibirás recibo.'}
            </span>
          </label>
        </div>
      </fieldset>

      {askGuestIdentity && (
        <>
          <label className={styles.label} htmlFor="donation-guest-name">
            Tu nombre
          </label>
          <Input
            id="donation-guest-name"
            data-testid="donation-guest-name"
            placeholder="Nombre y apellido"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />

          <label className={styles.label} htmlFor="donation-guest-email">
            Tu correo electrónico
          </label>
          <Input
            id="donation-guest-email"
            data-testid="donation-guest-email"
            type="email"
            placeholder="tucorreo@ejemplo.com"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
          />
          <p className={styles.hint}>
            No necesitas una cuenta para donar. Usamos tu correo para enviarte el recibo.
          </p>
        </>
      )}

      <label className={styles.label} htmlFor="donation-amount">
        Monto de tu donación (COP)
      </label>
      <Input
        id="donation-amount"
        inputMode="numeric"
        placeholder="50000"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value.replace(/[^\d]/g, ''))}
      />

      <label className={styles['checkbox-row']}>
        <input
          type="checkbox"
          className={styles['checkbox-row__input']}
          checked={coverFee}
          data-testid="cover-fee"
          onChange={(e) => setCoverFee(e.target.checked)}
        />
        <span>
          Cubro el apoyo de sostenimiento a AdoptaFácil y la comisión de la pasarela para que la
          organización reciba el monto completo.
        </span>
      </label>

      {preview ? (
        <DonationBreakdown intendedAmount={amount} commissionPayer={commissionPayer} />
      ) : (
        <p className={styles.hint}>
          Ingresa al menos {formatCop(MIN_DONATION_AMOUNT)} para ver el desglose.
        </p>
      )}

      <Button disabled={!canContinue} onClick={() => setStep('card')}>
        {submitting ? 'Procesando…' : `Donar a ${organizationName}`}
      </Button>
    </div>
  );
}
