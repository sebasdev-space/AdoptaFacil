import { formatCop, progressPercent } from '../model/campaigns-view';

export interface CampaignProgressProps {
  raisedAmount: number;
  goalAmount: number;
  /** Avance 0..1 del contrato. Se lee TAL CUAL (hoy 0 hasta conectar el recaudo real). */
  progress: number;
}

/**
 * Barra de avance de una campaña (§M06). Refleja el `progress` del backend SIN
 * calcularlo por cuenta propia — hoy vale 0 (el recaudo real se conecta contra el
 * PaymentPort en un slice posterior) y el componente ya queda listo para mostrar el
 * valor real sin retrabajo.
 */
export function CampaignProgress({ raisedAmount, goalAmount, progress }: CampaignProgressProps) {
  const pct = progressPercent(progress);
  return (
    <div className="space-y-1" data-testid="campaign-progress">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatCop(raisedAmount)} de {formatCop(goalAmount)} · {pct}%
      </p>
    </div>
  );
}
