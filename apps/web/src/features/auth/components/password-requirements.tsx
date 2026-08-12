import { MIN_PASSWORD_LENGTH } from '../validation';
import styles from './password-requirements.module.scss';

export interface PasswordRequirementsProps {
  password: string;
}

/**
 * Live checklist of password requirements as the user types. Deliberately
 * limited to the ONE rule the backend actually enforces today
 * (`apps/api/src/core/auth/auth.schemas.ts`: minimum 8 characters) — no
 * uppercase/digit/symbol items, since inventing requirements the backend
 * doesn't check would mislead the user about what's actually required.
 */
export function PasswordRequirements({ password }: PasswordRequirementsProps) {
  const meetsMinLength = password.length >= MIN_PASSWORD_LENGTH;

  return (
    <ul className={styles.list} aria-live="polite">
      <li className={meetsMinLength ? `${styles.item} ${styles['item--met']}` : styles.item}>
        <span className={styles.item__icon} aria-hidden="true">
          {meetsMinLength ? '✓' : '○'}
        </span>
        Al menos {MIN_PASSWORD_LENGTH} caracteres
      </li>
    </ul>
  );
}
