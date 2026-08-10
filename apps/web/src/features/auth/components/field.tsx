import { forwardRef } from 'react';
import { Input, cn, type InputProps } from '@adoptafacil/ui';
import styles from './field.module.scss';

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
 * `aria-invalid` drives the error styling in the UI token set. BEM+SCSS
 * (REFACTOR-VISUAL v2, Fase 5).
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { id, label, value, onChange, error, hint, required, className, ...inputProps },
  ref,
) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className={styles.field}>
      <label
        htmlFor={id}
        className={cn(styles.field__label, required && styles['field__label--required'])}
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
        <p id={hintId} className={styles.field__hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={styles.field__error}>
          {error}
        </p>
      )}
    </div>
  );
});
