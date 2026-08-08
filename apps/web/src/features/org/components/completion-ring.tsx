const RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface CompletionRingProps {
  percent: number;
  missing: number;
}

/**
 * Circular completeness meter (S2-05 top bar) — same visual idea as the mock's
 * signature element, redrawn with real design tokens (`text-primary`/
 * `text-muted`) instead of the mock's hardcoded hex, and driven by a REAL
 * percent computed from `Organization` fields (see `model/profile-completeness`),
 * never a constant.
 */
export function CompletionRing({ percent, missing }: CompletionRingProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-10 w-10 shrink-0">
        <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden>
          <circle cx="20" cy="20" r={RADIUS} fill="none" className="stroke-muted" strokeWidth="5" />
          <circle
            cx="20"
            cy="20"
            r={RADIUS}
            fill="none"
            className="stroke-primary transition-[stroke-dashoffset] duration-300 ease-out"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 20 20)"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
          {clamped}%
        </span>
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-foreground">
          {clamped >= 100 ? 'Perfil completo' : 'Perfil incompleto'}
        </p>
        <p className="text-xs text-muted-foreground">
          {clamped >= 100
            ? 'Toda la información recomendada está diligenciada.'
            : `Faltan ${missing} ${missing === 1 ? 'campo' : 'campos'} por diligenciar.`}
        </p>
      </div>
    </div>
  );
}
