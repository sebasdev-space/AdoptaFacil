import { useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Button } from '@adoptafacil/ui';
import { useSession } from '../../../shell/auth';
import { AuthLayout } from '../components/auth-layout';
import { Field } from '../components/field';
import { FormAlert } from '../components/form-alert';
import { collectErrors, validateEmail } from '../validation';

interface FromState {
  from?: Location;
}

/**
 * Login screen (replaces the T-021 stub). Controlled inputs, no native form
 * submit. On success the session is stored via useSession (T-022) and the user
 * lands back on the route the guard bounced them from.
 */
export function LoginPage() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as FromState | null)?.from?.pathname ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const result = collectErrors({
      email: validateEmail(email),
      // Login only requires a non-empty password (min-length is a register concern).
      password: password.length === 0 ? 'La contraseña es obligatoria.' : undefined,
    });
    setErrors(result.errors);
    setFormError(null);
    if (!result.isValid) {
      (result.errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await signIn({ email, password });
      navigate(from, { replace: true });
    } catch {
      // Generic message — never leak whether the email exists or which field failed.
      setFormError('No pudimos iniciar sesión. Revisa tu correo y contraseña.');
      setSubmitting(false);
    }
  };

  const onEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') void handleSubmit();
  };

  return (
    <AuthLayout
      title="Iniciar sesión"
      description="Ingresa a tu cuenta de AdoptaFácil."
      footer={
        <>
          <p>
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Regístrate
            </Link>
          </p>
          <p>
            <Link to="/forgot" className="font-medium text-primary hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        </>
      }
    >
      {formError && <FormAlert>{formError}</FormAlert>}

      <Field
        ref={emailRef}
        id="login-email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        onKeyDown={onEnter}
        error={errors.email}
        required
      />
      <Field
        ref={passwordRef}
        id="login-password"
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        onKeyDown={onEnter}
        error={errors.password}
        required
      />

      <Button
        type="button"
        className="w-full"
        onClick={() => void handleSubmit()}
        disabled={submitting}
      >
        {submitting ? 'Ingresando…' : 'Iniciar sesión'}
      </Button>
    </AuthLayout>
  );
}
