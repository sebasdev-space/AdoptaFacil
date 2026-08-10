import * as React from 'react';
import { cn } from '../lib/utils';
import styles from './stat-card.module.scss';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** e.g. "▲18% vs jun" — direction picks the success/destructive tint. */
  delta?: { label: React.ReactNode; direction: 'up' | 'down' };
  /** Extra content next to the value (a Badge, a muted hint, …). */
  accessory?: React.ReactNode;
  align?: 'center' | 'start';
}

/** Single metric tile — dashboard/summary stat rows across the app (BEM+SCSS). */
export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, delta, accessory, align = 'center', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        styles['stat-card'],
        align === 'start' && styles['stat-card--start'],
        className,
      )}
      {...props}
    >
      <p className={styles['stat-card__label']}>{label}</p>
      <div className={styles['stat-card__value-row']}>
        <span className={styles['stat-card__value']}>{value}</span>
        {delta && (
          <span
            className={cn(
              styles['stat-card__delta'],
              styles[delta.direction === 'up' ? 'stat-card__delta--up' : 'stat-card__delta--down'],
            )}
          >
            {delta.label}
          </span>
        )}
        {accessory}
      </div>
    </div>
  ),
);
StatCard.displayName = 'StatCard';
