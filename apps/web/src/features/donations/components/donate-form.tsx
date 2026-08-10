import { useState } from 'react';
import { MIN_DONATION_AMOUNT, type CommissionPayer } from '@adoptafacil/contracts';
import { Button, Input } from '@adoptafacil/ui';
import { DonationBreakdown } from './donation-breakdown';
import { formatCop, safeBuildDonationBreakdown } from '../model/donation-breakdown-view';
import styles from './donate-form.module.scss';

export interface DonateFormValues {
  intendedAmount: number;
  commissionPayer: CommissionPayer;
}

export interface DonateFormProps {
  organizationName: string;
  submitting?: boolean;
  onDonate: (values: DonateFormValues) => void;
}

/**
 * Formulario de donación (§M05, P1). PRESENTACIONAL (sin api/sesión) para poder
 * testearlo directo. Muestra el desglose transparente EN VIVO (misma cuenta que el
 * backend, vía `computeBreakdown`) y ofrece la casilla "cubro el apoyo de
 * sostenimiento y la comisión de la pasarela" (commissionPayer = 'donor';
 * F-NOMENCLATURA-CHECKBOX: extiende #100 al checkbox — el donante cubre AMBOS
 * componentes, el % que retiene AdoptaFácil (apoyo, no "comisión" propia por
 * indicación fiscal) y la comisión real de Wompi (tercero, mantiene su nombre).
 * Solo habilita "Donar" con un monto válido (≥ mínimo).
 */
export function DonateForm({ organizationName, submitting = false, onDonate }: DonateFormProps) {
  const [amountText, setAmountText] = useState('');
  const [coverFee, setCoverFee] = useState(false);

  const commissionPayer: CommissionPayer = coverFee ? 'donor' : 'organization';
  const amount = Number.parseInt(amountText, 10);
  const preview = safeBuildDonationBreakdown(amount, commissionPayer);
  const canSubmit = preview !== null && !submitting;

  return (
    <div className={styles.form}>
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

      <Button
        disabled={!canSubmit}
        onClick={() => preview && onDonate({ intendedAmount: amount, commissionPayer })}
      >
        {submitting ? 'Procesando…' : `Donar a ${organizationName}`}
      </Button>
    </div>
  );
}
