import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './button';
import styles from './error-state.module.scss';

export interface ErrorStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Defaults to a triangle-alert icon; pass `null` to omit it entirely. */
  icon?: React.ReactNode | null;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Convenience retry button — omit and use `action` for a custom control. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Custom action, overrides the `onRetry` button when both are given. */
  action?: React.ReactNode;
}

/**
 * Placeholder for a failed data fetch, with a retry affordance by default.
 * Announced as a status region (assertive, since an error should interrupt).
 */
export const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    {
      className,
      icon,
      title = 'No se pudo cargar la información',
      description,
      onRetry,
      retryLabel = 'Reintentar',
      action,
      ...props
    },
    ref,
  ) => (
    <div ref={ref} role="alert" className={cn(styles['error-state'], className)} {...props}>
      {icon !== null && (
        <div aria-hidden className={styles['error-state__icon']}>
          {icon ?? <AlertTriangle />}
        </div>
      )}
      <p className={styles['error-state__title']}>{title}</p>
      {description ? <p className={styles['error-state__description']}>{description}</p> : null}
      {(action ?? onRetry) ? (
        <div className={styles['error-state__action']}>
          {action ?? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  ),
);
ErrorState.displayName = 'ErrorState';
