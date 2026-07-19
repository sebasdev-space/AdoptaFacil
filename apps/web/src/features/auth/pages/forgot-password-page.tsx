import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@adoptafacil/ui';
import { useSession } from '../../../shell/auth';
import { AuthLayout } from '../components/auth-layout';
import { Field } from '../components/field';
import { FormAlert } from '../components/form-alert';
import { validateEmail } from '../validation';

/**
 * Generic confirmation shown after any valid request. The backend returns 202
 * with no body (it never reveals whether the account exists), so the copy lives
 * here on the client.
 */
const GENERIC_CONFIRMATION =
  'Si el correo está registrado, enviaremos instrucciones para restablecer la contraseña.';

/**
 * Password-recovery request. Sends the request via useSession and shows a
 * generic confirmation that never reveals whether the account exists.
 */
export function ForgotPasswordPage() {
  const { requestPasswordReset } = useSession();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const emailError = validateEmail(email);
    setError(emailError);
    setFormError(null);
    if (emailError) {
      emailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await requestPasswordReset({ email: email.trim() });
      setConfirmation(GENERIC_CONFIRMATION);
    } catch {
      setFormError('No pudimos procesar la solicitud. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  };

  const onEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') void handleSubmit();
  };

  return (
    <AuthLayout
      title="Recuperar contraseña"
      description="Te enviaremos instrucciones para restablecerla."
      footer={
        <p>
          <Link to="/login" className="font-medium text-primary hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      }
    >
      {confirmation ? (
        <FormAlert variant="success">{confirmation}</FormAlert>
      ) : (
        <>
          {formError && <FormAlert>{formError}</FormAlert>}
          <Field
            ref={emailRef}
            id="forgot-email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            onKeyDown={onEnter}
            error={error}
            required
          />
          <Button
            type="button"
            className="w-full"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? 'Enviando…' : 'Enviar instrucciones'}
          </Button>
        </>
      )}
    </AuthLayout>
  );
}
