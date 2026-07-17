import { cn } from '@adoptafacil/ui';

export interface FormAlertProps {
  variant?: 'error' | 'success' | 'info';
  children: React.ReactNode;
  className?: string;
}

const VARIANTS: Record<NonNullable<FormAlertProps['variant']>, string> = {
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
  success: 'border-success/40 bg-success/10 text-success',
  info: 'border-info/40 bg-info/10 text-info',
};

/**
 * Form-level status message. Errors/success use `role="alert"` (assertive) so
 * screen readers announce them the moment they appear; info is polite.
 */
export function FormAlert({ variant = 'error', children, className }: FormAlertProps) {
  return (
    <div
      role={variant === 'info' ? 'status' : 'alert'}
      aria-live={variant === 'info' ? 'polite' : 'assertive'}
      className={cn('rounded-md border px-3 py-2 text-sm', VARIANTS[variant], className)}
    >
      {children}
    </div>
  );
}
