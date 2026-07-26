import { useState } from 'react';
import { MIN_DONATION_AMOUNT, type CommissionPayer } from '@adoptafacil/contracts';
import { Button, Input } from '@adoptafacil/ui';
import { DonationBreakdown } from './donation-breakdown';
import { formatCop, safeBuildDonationBreakdown } from '../model/donation-breakdown-view';

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
 * backend, vía `computeBreakdown`) y ofrece la casilla "cubro la comisión"
 * (commissionPayer = 'donor'). Solo habilita "Donar" con un monto válido (≥ mínimo).
 */
export function DonateForm({ organizationName, submitting = false, onDonate }: DonateFormProps) {
  const [amountText, setAmountText] = useState('');
  const [coverFee, setCoverFee] = useState(false);

  const commissionPayer: CommissionPayer = coverFee ? 'donor' : 'organization';
  const amount = Number.parseInt(amountText, 10);
  const preview = safeBuildDonationBreakdown(amount, commissionPayer);
  const canSubmit = preview !== null && !submitting;

  return (
    <div className="space-y-4">
      <label className="space-y-1.5 text-sm font-medium" htmlFor="donation-amount">
        Monto de tu donación (COP)
      </label>
      <Input
        id="donation-amount"
        inputMode="numeric"
        placeholder="50000"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value.replace(/[^\d]/g, ''))}
      />

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={coverFee}
          data-testid="cover-fee"
          onChange={(e) => setCoverFee(e.target.checked)}
        />
        <span>Cubro la comisión para que la organización reciba el monto completo.</span>
      </label>

      {preview ? (
        <DonationBreakdown intendedAmount={amount} commissionPayer={commissionPayer} />
      ) : (
        <p className="text-xs text-muted-foreground">
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
