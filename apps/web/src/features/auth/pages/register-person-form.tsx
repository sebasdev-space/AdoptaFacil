import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@adoptafacil/ui';
import { ApiError, type RegisterPersonRequest } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { Field } from '../components/field';
import { FormAlert } from '../components/form-alert';
import {
  collectErrors,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
  validateRequired,
} from '../validation';

type PersonErrors = Partial<
  Record<'firstName' | 'lastName' | 'email' | 'password' | 'confirm', string>
>;

/**
 * Registration form for a PERSON account (§13). Registration captures only what
 * the backend DTO needs; first and last name are combined into the required
 * `displayName`. Phone is not part of account creation (see M01, Ola 1).
 */
export function RegisterPersonForm() {
  const { register } = useSession();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [errors, setErrors] = useState<PersonErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refs = {
    firstName: useRef<HTMLInputElement>(null),
    lastName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };

  const handleSubmit = async () => {
    const result = collectErrors({
      firstName: validateRequired(firstName, 'El nombre'),
      lastName: validateRequired(lastName, 'El apellido'),
      email: validateEmail(email),
      password: validatePassword(password),
      confirm: validatePasswordConfirmation(password, confirm),
    });
    setErrors(result.errors);
    setFormError(null);
    if (!result.isValid) {
      const order = ['firstName', 'lastName', 'email', 'password', 'confirm'] as const;
      const first = order.find((key) => result.errors[key]);
      if (first) refs[first].current?.focus();
      return;
    }

    const request: RegisterPersonRequest = {
      accountType: 'person',
      displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
      email: email.trim(),
      password,
    };

    setSubmitting(true);
    try {
      await register(request);
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(
        ApiError.is(error) && error.code === 'email_taken'
          ? 'Ya existe una cuenta con este correo.'
          : 'No pudimos crear la cuenta. Inténtalo de nuevo.',
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {formError && <FormAlert>{formError}</FormAlert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          ref={refs.firstName}
          id="person-first"
          label="Nombre"
          autoComplete="given-name"
          value={firstName}
          onChange={setFirstName}
          error={errors.firstName}
          required
        />
        <Field
          ref={refs.lastName}
          id="person-last"
          label="Apellido"
          autoComplete="family-name"
          value={lastName}
          onChange={setLastName}
          error={errors.lastName}
          required
        />
      </div>
      <Field
        ref={refs.email}
        id="person-email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        error={errors.email}
        required
      />
      <Field
        ref={refs.password}
        id="person-password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        error={errors.password}
        required
      />
      <Field
        ref={refs.confirm}
        id="person-confirm"
        label="Confirmar contraseña"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
        error={errors.confirm}
        required
      />

      <Button
        type="button"
        className="w-full"
        onClick={() => void handleSubmit()}
        disabled={submitting}
      >
        {submitting ? 'Creando cuenta…' : 'Crear cuenta personal'}
      </Button>
    </div>
  );
}
