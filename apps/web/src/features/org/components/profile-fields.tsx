import { cn, Input, type InputProps } from '@adoptafacil/ui';

// packages/ui currently ships no Textarea or Label primitive (reported as a UI
// gap in T-101). These labeled wrappers are feature-local until @adoptafacil/ui
// provides them; the styling mirrors the shared Input token set.

interface LabeledProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

export type TextFieldProps = LabeledProps &
  Omit<InputProps, 'id' | 'value' | 'onChange'> & {
    value: string;
    onChange: (value: string) => void;
  };

export function TextField({ id, label, value, onChange, error, hint, ...rest }: TextFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
        }
        onChange={(event) => onChange(event.target.value)}
        {...rest}
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
}

export interface TextAreaFieldProps extends LabeledProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  rows = 4,
  placeholder,
}: TextAreaFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
        }
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-destructive',
        )}
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
}
