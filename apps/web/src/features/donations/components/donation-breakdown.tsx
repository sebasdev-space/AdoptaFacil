import type { CommissionPayer } from '@adoptafacil/contracts';
import { buildDonationBreakdown, formatCop } from '../model/donation-breakdown-view';

export interface DonationBreakdownProps {
  intendedAmount: number;
  commissionPayer: CommissionPayer;
}

/**
 * Desglose transparente de la donación (§M05, P1) que se muestra ANTES de pagar. Las
 * cifras vienen ÍNTEGRAS de `computeBreakdown` (vía el view-model); este componente
 * solo las presenta. Resalta lo que paga la Persona y lo que recibe la organización.
 */
export function DonationBreakdown({ intendedAmount, commissionPayer }: DonationBreakdownProps) {
  const { lines } = buildDonationBreakdown(intendedAmount, commissionPayer);
  return (
    <dl className="space-y-1.5 text-sm" data-testid="donation-breakdown">
      {lines.map((line) => (
        <div
          key={line.key}
          className={
            line.emphasis
              ? 'flex items-center justify-between font-semibold'
              : 'flex items-center justify-between text-muted-foreground'
          }
        >
          <dt>{line.label}</dt>
          <dd data-testid={`breakdown-${line.key}`}>{formatCop(line.amount)}</dd>
        </div>
      ))}
      <p className="pt-1 text-xs text-muted-foreground">
        {commissionPayer === 'donor'
          ? 'Cubres las comisiones: la organización recibe el monto completo.'
          : 'La organización asume las comisiones sobre tu donación.'}
      </p>
    </dl>
  );
}
