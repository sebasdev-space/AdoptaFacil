import { progressPercent } from '../model/resources-view';

export interface NeedProgressProps {
  quantityFulfilled: number;
  quantityNeeded: number;
  unit: string;
  /** Avance 0..1 del contrato — se lee TAL CUAL, nunca recalculado aquí. */
  progress: number;
}

/** Barra de avance de una necesidad (M09) — mismo patrón visual que
 *  `CampaignProgress`, pero en cantidad/unidad en vez de pesos. */
export function NeedProgress({
  quantityFulfilled,
  quantityNeeded,
  unit,
  progress,
}: NeedProgressProps) {
  const pct = progressPercent(progress);
  return (
    <div className="space-y-1" data-testid="need-progress">
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
        {quantityFulfilled} de {quantityNeeded} {unit} · {pct}%
      </p>
    </div>
  );
}
