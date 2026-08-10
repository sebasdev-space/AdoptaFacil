import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import styles from './coming-soon.module.scss';

export interface ComingSoonProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Defaults to "Pronto" — matches the sidebar item's own badge. */
  badgeLabel?: React.ReactNode;
}

/**
 * Placeholder for a module that doesn't exist yet (Voluntariado, Libro
 * público/Transparencia nacional, Reporte exógeno 2575) — its sidebar entry
 * stays visible with a "Pronto" badge and routes here instead of a built
 * screen. BEM+SCSS.
 */
export const ComingSoon = React.forwardRef<HTMLDivElement, ComingSoonProps>(
  ({ className, icon, title, description, badgeLabel = 'Pronto', ...props }, ref) => (
    <div ref={ref} role="status" className={cn(styles['coming-soon'], className)} {...props}>
      <span className={styles['coming-soon__icon']} aria-hidden>
        {icon ?? <Sparkles />}
      </span>
      <span className={styles['coming-soon__badge']}>{badgeLabel}</span>
      <p className={styles['coming-soon__title']}>{title}</p>
      {description && <p className={styles['coming-soon__description']}>{description}</p>}
    </div>
  ),
);
ComingSoon.displayName = 'ComingSoon';
