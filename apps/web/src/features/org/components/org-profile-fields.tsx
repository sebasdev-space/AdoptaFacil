import { cn } from '@adoptafacil/ui';
import styles from './org-profile-form.module.scss';

/**
 * Campos BEM/SCSS EXCLUSIVOS de "Perfil de la organización" — a propósito NO
 * son el `TextField`/`TextAreaField` de `./profile-fields.tsx`: ese archivo
 * también lo usan `org-formalization-page`, `org-documents-page`,
 * `platform-documents-review-page` y varias vistas de animales/campañas, y el
 * encargo de este refactor es "SOLO visualmente la vista Mi organización" —
 * cambiar ese archivo compartido habría estilizado 8+ pantallas ajenas a esta
 * tarea. Estos wrappers son la versión feature-local con el estilo nuevo
 * (radio --r-lg, label uppercase, foco --brand) pedido para esta vista.
 */

interface LabeledProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

export interface OrgTextFieldProps extends LabeledProps {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  /** Mirrors a backend `shortText(n)` cap (org.schemas.ts) so typing past it is
   *  stopped by the browser instead of failing silently at save time. */
  maxLength?: number;
}

function fieldAria(id: string, error?: string, hint?: string) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return {
    errorId,
    hintId,
    describedBy:
      [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined,
  };
}

export function OrgTextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  placeholder,
  maxLength,
}: OrgTextFieldProps) {
  const { errorId, hintId, describedBy } = fieldAria(id, error, hint);
  return (
    <div className={styles['org-form__field']}>
      <label htmlFor={id} className={styles['org-form__label']}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className={styles['org-form__input']}
      />
      {hint && !error && (
        <p id={hintId} className={styles['org-form__help']}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={styles['org-form__error']}>
          {error}
        </p>
      )}
    </div>
  );
}

export interface OrgTextAreaFieldProps extends LabeledProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
}

export function OrgTextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  rows = 5,
  placeholder,
  maxLength,
}: OrgTextAreaFieldProps) {
  const { errorId, hintId, describedBy } = fieldAria(id, error, hint);
  return (
    <div className={styles['org-form__field']}>
      <label htmlFor={id} className={styles['org-form__label']}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className={styles['org-form__textarea']}
      />
      {typeof maxLength === 'number' && (
        <p className={styles['org-form__counter']}>
          {value.length}/{maxLength}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className={styles['org-form__help']}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={styles['org-form__error']}>
          {error}
        </p>
      )}
    </div>
  );
}

export interface OrgSelectOption {
  value: string;
  label: string;
}

export interface OrgSelectFieldProps extends LabeledProps {
  value: string;
  onChange: (value: string) => void;
  options: OrgSelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

/** Chevron feature-local — misma convención que los demás glifos SVG inline
 *  de este módulo (ver `org-profile-page.tsx`), sin agregar una librería de
 *  iconos solo para esto. */
function ChevronIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn('h-4 w-4', styles['org-form__select-chevron'])}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function OrgSelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  error,
  hint,
}: OrgSelectFieldProps) {
  const { errorId, hintId, describedBy } = fieldAria(id, error, hint);
  return (
    <div className={styles['org-form__field']}>
      <label htmlFor={id} className={styles['org-form__label']}>
        {label}
      </label>
      <div className={styles['org-form__select-wrap']}>
        <select
          id={id}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className={styles['org-form__select']}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronIcon />
      </div>
      {hint && !error && (
        <p id={hintId} className={styles['org-form__help']}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={styles['org-form__error']}>
          {error}
        </p>
      )}
    </div>
  );
}

export function OrgStaticField({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className={styles['org-form__field']}>
      <span id={`${id}-label`} className={styles['org-form__label']}>
        {label}
      </span>
      <p id={id} aria-labelledby={`${id}-label`} className={styles['org-form__static']}>
        {value}
      </p>
    </div>
  );
}
