import { useRef, useState } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { Button, Card, CardContent } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useSession } from '../../../shell/auth';
import { Field } from '../components/field';
import { FormAlert } from '../components/form-alert';
import { collectErrors, validateRequired } from '../validation';

interface FromState {
  from?: Location;
  /** Optional hint shown above the form — set by a gated page (donar,
   *  solicitar adopción, inscribirse a voluntariado) that just caught a 422
   *  INCOMPLETE_PROFILE, so the person understands WHY they landed here. */
  reason?: string;
}

type ProfileErrors = Partial<Record<'phone' | 'documentId' | 'address', string>>;

/**
 * "Completa tu perfil" (T-Google-SignIn, business rule #3): reached when a
 * gated action (donar/apadrinar, solicitar adopción, inscribirse a
 * voluntariado) responds 422 `INCOMPLETE_PROFILE`. Captures the 3 required
 * fields and calls `PATCH /auth/me/profile`. Retrying the ORIGINAL action
 * automatically is not wired here (each gated page owns its own form state,
 * and the call sites live across 3 different feature areas) — on success this
 * shows a clear confirmation and, when the caller passed `state.from`, a
 * button back to that page so the person retries the action themselves,
 * matching this task's "at minimum, ask the person to retry manually" bar.
 */
export function CompleteProfilePage() {
  const { user, completeProfile } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as FromState | null) ?? null;

  const [phone, setPhone] = useState(user?.phone ?? '');
  const [documentId, setDocumentId] = useState(user?.documentId ?? '');
  const [address, setAddress] = useState(user?.address ?? '');
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const refs = {
    phone: useRef<HTMLInputElement>(null),
    documentId: useRef<HTMLInputElement>(null),
    address: useRef<HTMLInputElement>(null),
  };

  const handleSubmit = async () => {
    const result = collectErrors({
      phone: validateRequired(phone, 'El teléfono'),
      documentId: validateRequired(documentId, 'El documento de identidad'),
      address: validateRequired(address, 'La dirección'),
    });
    setErrors(result.errors);
    setFormError(null);
    if (!result.isValid) {
      const order = ['phone', 'documentId', 'address'] as const;
      const first = order.find((key) => result.errors[key]);
      if (first) refs[first].current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await completeProfile({
        phone: phone.trim(),
        documentId: documentId.trim(),
        address: address.trim(),
      });
      setDone(true);
    } catch {
      setFormError('No pudimos guardar tu perfil. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Completa tu perfil"
        description={
          state?.reason ??
          'Necesitamos estos datos para donar/apadrinar, solicitar una adopción o inscribirte como voluntario.'
        }
      />
      <Card className="mx-auto max-w-lg">
        <CardContent className="space-y-4 pt-6">
          {done ? (
            <div className="space-y-4">
              <FormAlert variant="success">
                Perfil actualizado. Ya puedes continuar con tu acción.
              </FormAlert>
              <Button
                type="button"
                className="w-full"
                onClick={() =>
                  navigate(state?.from ? `${state.from.pathname}${state.from.search}` : '/inicio')
                }
              >
                {state?.from ? 'Volver a intentarlo' : 'Ir al inicio'}
              </Button>
            </div>
          ) : (
            <>
              {formError && <FormAlert>{formError}</FormAlert>}
              <Field
                ref={refs.phone}
                id="profile-phone"
                label="Teléfono de contacto"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={setPhone}
                error={errors.phone}
                required
              />
              <Field
                ref={refs.documentId}
                id="profile-document"
                label="Documento de identidad (cédula)"
                autoComplete="off"
                value={documentId}
                onChange={setDocumentId}
                error={errors.documentId}
                required
              />
              <Field
                ref={refs.address}
                id="profile-address"
                label="Dirección / ciudad de residencia"
                autoComplete="street-address"
                value={address}
                onChange={setAddress}
                error={errors.address}
                required
              />
              <Button
                type="button"
                className="w-full"
                onClick={() => void handleSubmit()}
                disabled={submitting}
              >
                {submitting ? 'Guardando…' : 'Guardar perfil'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
