import * as React from 'react';
import { cn } from '../lib/utils';
import styles from './empty-state.module.scss';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional decorative icon/illustration shown above the title. */
  icon?: React.ReactNode;
  /** Short headline describing the empty condition. */
  title: React.ReactNode;
  /** Supporting text explaining what to do next. */
  description?: React.ReactNode;
  /** Primary call to action (e.g. a Button). */
  action?: React.ReactNode;
}

/**
 * Placeholder for "no data yet" regions. Announced as a status region so
 * assistive tech reads it when it replaces a list/table. Icon is decorative.
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => (
    <div ref={ref} role="status" className={cn(styles['empty-state'], className)} {...props}>
      {icon ? (
        <div aria-hidden className={styles['empty-state__icon']}>
          {icon}
        </div>
      ) : null}
      <p className={styles['empty-state__title']}>{title}</p>
      {description ? <p className={styles['empty-state__description']}>{description}</p> : null}
      {action ? <div className={styles['empty-state__action']}>{action}</div> : null}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';
