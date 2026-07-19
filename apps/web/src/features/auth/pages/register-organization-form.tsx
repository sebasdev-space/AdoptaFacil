import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@adoptafacil/ui';
import { ApiError, type RegisterOrganizationRequest } from '../../../shell/api';
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

type OrgErrors = Partial<
  Record<'organizationName' | 'contactName' | 'email' | 'password' | 'confirm', string>
>;

/**
 * Registration form for an ORGANIZATION account (§13). Registration captures
 * only what the backend DTO needs: organization name, the legal contact (sent as
 * the owner user's `displayName`), email and password. The NIT (and phone)
 * belong to the M01 formalization flow (Ola 1), not to account creation.
 */
export function RegisterOrganizationForm() {
  const { register } = useSession();
  const navigate = useNavigate();

  const [organizationName, setOrganizationName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [errors, setErrors] = useState<OrgErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refs = {
    organizationName: useRef<HTMLInputElement>(null),
    contactName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };

  const handleSubmit = async () => {
    const result = collectErrors({
      organizationName: validateRequired(organizationName, 'El nombre de la organización'),
      contactName: validateRequired(contactName, 'El nombre de contacto'),
      email: validateEmail(email),
      password: validatePassword(password),
      confirm: validatePasswordConfirmation(password, confirm),
    });
    setErrors(result.errors);
    setFormError(null);
    if (!result.isValid) {
      const order = ['organizationName', 'contactName', 'email', 'password', 'confirm'] as const;
      const first = order.find((key) => result.errors[key]);
      if (first) refs[first].current?.focus();
      return;
    }

    const request: RegisterOrganizationRequest = {
      accountType: 'organization',
      organizationName: organizationName.trim(),
      displayName: contactName.trim(),
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

      <Field
        ref={refs.organizationName}
        id="org-name"
        label="Nombre de la organización"
        autoComplete="organization"
        value={organizationName}
        onChange={setOrganizationName}
        error={errors.organizationName}
        required
      />
      <Field
        ref={refs.contactName}
        id="org-contact"
        label="Nombre de contacto"
        autoComplete="name"
        value={contactName}
        onChange={setContactName}
        error={errors.contactName}
        required
      />
      <Field
        ref={refs.email}
        id="org-email"
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
        id="org-password"
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
        id="org-confirm"
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
        {submitting ? 'Creando cuenta…' : 'Crear cuenta de organización'}
      </Button>
    </div>
  );
}
