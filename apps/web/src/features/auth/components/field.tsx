import { forwardRef } from 'react';
import { Input, cn, type InputProps } from '@adoptafacil/ui';

export interface FieldProps extends Omit<InputProps, 'onChange' | 'value' | 'id'> {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}

/**
 * Accessible labeled input: the `<label>` is associated via `htmlFor`, the error
 * is linked through `aria-describedby` and announced (`role="alert"`), and
 * `aria-invalid` drives the error styling in the UI token set.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { id, label, value, onChange, error, hint, required, className, ...inputProps },
  ref,
) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className={cn(
          'block text-sm font-medium text-foreground',
          // Decorative required marker via a pseudo-element, so it stays out of
          // the label's accessible name/text (required is conveyed to AT by the
          // input's `required`/`aria-invalid`).
          required && "after:ml-0.5 after:text-destructive after:content-['*']",
        )}
      >
        {label}
      </label>
      <Input
        id={id}
        ref={ref}
        value={value}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(className)}
        {...inputProps}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
});
