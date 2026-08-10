import { Badge, Skeleton, cn, type BadgeProps } from '@adoptafacil/ui';
import {
  ACCOUNTABILITY_LABELS,
  useTransparency,
  type AccountabilityState,
} from './transparency-context';
import styles from './transparency-indicator.module.scss';

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
 * the labels condense below `sm`, keeping the three data points readable on móvil.
 * Data comes from <TransparencyProvider> (placeholder in Ola 0). BEM+SCSS
 * (REFACTOR-VISUAL v2, Fase 3) — same data/behavior, new look.
 */
export function TransparencyIndicator({ className }: TransparencyIndicatorProps) {
  const state = useTransparency();

  // No session / no org transparency (e.g. a person account) → render nothing.
  if (state.status === 'hidden') {
    return null;
  }

  if (state.status === 'loading') {
    return (
      <div
        className={cn(styles.indicator, className)}
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
        className={cn(styles.indicator__error, className)}
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
      className={cn(styles.indicator, className)}
      data-testid="transparency-indicator"
      role="group"
      aria-label={`Transparencia: Nivel ${level}, ${formalizationPct}% de formalización, rendición ${accountabilityLabel}`}
    >
      <span className={styles.indicator__group}>
        <span className={styles.indicator__label}>Nivel</span>
        <span aria-hidden>{level}</span>
      </span>

      <span aria-hidden className={styles.indicator__divider}>
        ·
      </span>

      <span className={cn(styles.indicator__group, 'tabular-nums')}>
        {formalizationPct}%
        <span className={cn(styles.indicator__label, styles['indicator__label--long'])}>
          formalización
        </span>
        <span className={cn(styles.indicator__label, styles['indicator__label--short'])}>
          form.
        </span>
      </span>

      <span aria-hidden className={styles.indicator__divider}>
        ·
      </span>

      <span className={styles.indicator__group}>
        <span className={cn(styles.indicator__label, styles['indicator__label--long'])}>
          Rendición
        </span>
        <Badge variant={ACCOUNTABILITY_VARIANT[accountability]}>{accountabilityLabel}</Badge>
      </span>
    </div>
  );
}
