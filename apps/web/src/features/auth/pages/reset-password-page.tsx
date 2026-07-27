import { useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@adoptafacil/ui';
import { useSession } from '../../../shell/auth';
import { AuthLayout } from '../components/auth-layout';
import { Field } from '../components/field';
import { FormAlert } from '../components/form-alert';
import { collectErrors, validatePassword, validatePasswordConfirmation } from '../validation';

/**
 * Step 2 of password recovery (T-110 / RF05). Reached from the emailed link
 * `{WEB_BASE_URL}/reset-password?token=…`. Reads the single-use token from the
 * query string, collects and confirms the new password, and posts both to the
 * backend. On success the user is sent to /login to sign in with the new
 * password. A missing/invalid/expired token yields a generic error — the copy
 * never reveals which condition failed.
 */
export function ResetPasswordPage() {
  const { confirmPasswordReset } = useSession();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const result = collectErrors({
      password: validatePassword(password),
      confirmation: validatePasswordConfirmation(password, confirmation),
    });
    setErrors(result.errors);
    setFormError(null);
    if (!result.isValid) {
      (result.errors.password ? passwordRef : confirmationRef).current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset({ token, password });
      setDone(true);
    } catch {
      // Generic message — never reveals whether the token was missing, expired,
      // already used, or invalid.
      setFormError('El enlace no es válido o expiró. Solicita uno nuevo para continuar.');
      setSubmitting(false);
    }
  };

  const onEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') void handleSubmit();
  };

  // No token in the link → nothing to do; guide the user back to the request flow.
  if (!token) {
    return (
      <AuthLayout
        title="Enlace no válido"
        description="Este enlace de restablecimiento está incompleto o expiró."
        footer={
          <p>
            <Link to="/forgot" className="font-medium text-primary hover:underline">
              Solicitar un nuevo enlace
            </Link>
          </p>
        }
      >
        <FormAlert>No encontramos un token válido en el enlace.</FormAlert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Nueva contraseña"
      description="Elige una contraseña nueva para tu cuenta."
      footer={
        <p>
          <Link to="/login" className="font-medium text-primary hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      }
    >
      {done ? (
        <FormAlert variant="success">
          Tu contraseña se cambió correctamente. Ya puedes iniciar sesión con la nueva contraseña.
        </FormAlert>
      ) : (
        <>
          {formError && <FormAlert>{formError}</FormAlert>}
          <Field
            ref={passwordRef}
            id="reset-password"
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            onKeyDown={onEnter}
            error={errors.password}
            required
          />
          <Field
            ref={confirmationRef}
            id="reset-password-confirm"
            label="Confirma la contraseña"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={setConfirmation}
            onKeyDown={onEnter}
            error={errors.confirmation}
            required
          />
          <Button
            type="button"
            className="w-full"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
        </>
      )}
    </AuthLayout>
  );
}
