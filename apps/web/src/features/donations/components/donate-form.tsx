import { useState } from 'react';
import { MIN_DONATION_AMOUNT, type CommissionPayer } from '@adoptafacil/contracts';
import { Button, Input } from '@adoptafacil/ui';
import { DonationBreakdown } from './donation-breakdown';
import { formatCop, safeBuildDonationBreakdown } from '../model/donation-breakdown-view';
import styles from './donate-form.module.scss';

/** Regex de validación LIVIANA en UI — el backend (zod, `.email()`) es la
 *  autoridad real; esto solo evita habilitar "Donar" con algo obviamente
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
}

export interface DonateFormProps {
  organizationName: string;
  submitting?: boolean;
  /** Hay una sesión activa (Persona autenticada). `false` ⇒ checkout de
   *  invitado (requisito del cliente: donar nunca exige cuenta ni login) —
   *  el formulario pide nombre + correo y los exige antes de habilitar
   *  "Donar". Con sesión, esos campos ni se muestran (se prellenan aparte). */
  hasSession: boolean;
  onDonate: (values: DonateFormValues) => void;
}

/**
 * Formulario de donación (§M05, P1 + checkout de invitado). PRESENTACIONAL (sin
 * api/sesión real, recibe `hasSession` como prop) para poder testearlo directo.
 * Muestra el desglose transparente EN VIVO (misma cuenta que el backend, vía
 * `computeBreakdown`) y ofrece la casilla "cubro el apoyo de sostenimiento y la
 * comisión de la pasarela" (commissionPayer = 'donor'; F-NOMENCLATURA-CHECKBOX:
 * extiende #100 al checkbox — el donante cubre AMBOS componentes, el % que
 * retiene AdoptaFácil (apoyo, no "comisión" propia por indicación fiscal) y la
 * comisión real de la pasarela de pago (tercero, mantiene su nombre —
 * MercadoPago).
 * Sin sesión, además exige nombre + correo (checkout de invitado — MercadoPago
 * Checkout Pro ya soporta pago de invitado) y ofrece la casilla de donación
 * anónima FRENTE A LA ORGANIZACIÓN (disponible con o sin sesión).
 * Solo habilita "Donar" con un monto válido (≥ mínimo) y, sin sesión, con
 * nombre + correo completos.
 */
export function DonateForm({
  organizationName,
  submitting = false,
  hasSession,
  onDonate,
}: DonateFormProps) {
  const [amountText, setAmountText] = useState('');
  const [coverFee, setCoverFee] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  const commissionPayer: CommissionPayer = coverFee ? 'donor' : 'organization';
  const amount = Number.parseInt(amountText, 10);
  const preview = safeBuildDonationBreakdown(amount, commissionPayer);
  const guestIdentityComplete =
    hasSession || (guestName.trim().length > 0 && EMAIL_LOOKS_VALID.test(guestEmail.trim()));
  const canSubmit = preview !== null && !submitting && guestIdentityComplete;

  const submit = () => {
    if (!preview || !canSubmit) return;
    onDonate({
      intendedAmount: amount,
      commissionPayer,
      anonymous,
      guestPayer: hasSession ? undefined : { fullName: guestName.trim(), email: guestEmail.trim() },
    });
  };

  return (
    <div className={styles.form}>
      {!hasSession && (
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

      <label className={styles['checkbox-row']}>
        <input
          type="checkbox"
          className={styles['checkbox-row__input']}
          checked={anonymous}
          data-testid="donate-anonymous"
          onChange={(e) => setAnonymous(e.target.checked)}
        />
        <span>¿Donar de forma anónima frente a la organización?</span>
      </label>

      {preview ? (
        <DonationBreakdown intendedAmount={amount} commissionPayer={commissionPayer} />
      ) : (
        <p className={styles.hint}>
          Ingresa al menos {formatCop(MIN_DONATION_AMOUNT)} para ver el desglose.
        </p>
      )}

      <Button disabled={!canSubmit} onClick={submit}>
        {submitting ? 'Procesando…' : `Donar a ${organizationName}`}
      </Button>
    </div>
  );
}
