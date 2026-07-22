import { Badge, Skeleton, cn, type BadgeProps } from '@adoptafacil/ui';
import {
  ACCOUNTABILITY_LABELS,
  useTransparency,
  type AccountabilityState,
} from './transparency-context';

const ACCOUNTABILITY_VARIANT: Record<AccountabilityState, BadgeProps['variant']> = {
  'al-dia': 'success',
  pendiente: 'warning',
  atrasada: 'destructive',
  // Placeholder honesto (§M14): aún no hay dato de rendición → neutro, no un juicio.
  'no-disponible': 'outline',
};

export interface TransparencyIndicatorProps {
  className?: string;
}

/**
 * Persistent transparency indicator (§M14): "Nivel · % formalización · rendición".
 *
 * Rendered in the shell header so it is present on **every** module. Responsive:
 * the labels condense below `md`, keeping the three data points readable on móvil.
 * Data comes from <TransparencyProvider> (placeholder in Ola 0).
 */
export function TransparencyIndicator({ className }: TransparencyIndicatorProps) {
  const state = useTransparency();

  if (state.status === 'loading') {
    return (
      <div
        className={cn('flex items-center gap-2', className)}
        data-testid="transparency-indicator"
        aria-busy="true"
        aria-label="Cargando indicador de transparencia"
      >
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-16" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div
        className={cn('text-xs text-muted-foreground', className)}
        data-testid="transparency-indicator"
        role="status"
      >
        Indicador de transparencia no disponible
      </div>
    );
  }

  const { level, formalizationPct, accountability } = state.data;
  const accountabilityLabel = ACCOUNTABILITY_LABELS[accountability];

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs sm:gap-2 sm:text-sm',
        className,
      )}
      data-testid="transparency-indicator"
      role="group"
      aria-label={`Transparencia: Nivel ${level}, ${formalizationPct}% de formalización, rendición ${accountabilityLabel}`}
    >
      <span className="flex items-center gap-1 font-medium">
        <span className="text-muted-foreground">Nivel</span>
        <span aria-hidden>{level}</span>
      </span>

      <span aria-hidden className="text-border">
        ·
      </span>

      <span className="flex items-center gap-1 font-medium tabular-nums">
        {formalizationPct}%
        <span className="hidden font-normal text-muted-foreground sm:inline">formalización</span>
        <span className="font-normal text-muted-foreground sm:hidden">form.</span>
      </span>

      <span aria-hidden className="text-border">
        ·
      </span>

      <span className="flex items-center gap-1">
        <span className="hidden text-muted-foreground sm:inline">Rendición</span>
        <Badge variant={ACCOUNTABILITY_VARIANT[accountability]}>{accountabilityLabel}</Badge>
      </span>
    </div>
  );
}
