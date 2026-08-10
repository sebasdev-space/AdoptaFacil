import { cn } from '@adoptafacil/ui';
import styles from './form-alert.module.scss';

export interface FormAlertProps {
  variant?: 'error' | 'success' | 'info';
  children: React.ReactNode;
  className?: string;
}

const VARIANT_CLASS: Record<NonNullable<FormAlertProps['variant']>, string> = {
  error: 'alert--error',
  success: 'alert--success',
  info: 'alert--info',
};

/**
 * Form-level status message. Errors/success use `role="alert"` (assertive) so
 * screen readers announce them the moment they appear; info is polite.
 * BEM+SCSS (REFACTOR-VISUAL v2, Fase 5).
 */
export function FormAlert({ variant = 'error', children, className }: FormAlertProps) {
  return (
    <div
      role={variant === 'info' ? 'status' : 'alert'}
      aria-live={variant === 'info' ? 'polite' : 'assertive'}
      className={cn(styles.alert, styles[VARIANT_CLASS[variant]], className)}
    >
      {children}
    </div>
  );
}
