import { useMemo, useState, type FormEvent } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  ADOPTION_MESSAGE_MIN_LENGTH,
  type AdoptionAnimalSnapshot,
  type AnimalSpecies,
} from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { validateEmail, validateRequired } from '../../auth/validation';
import { createAdoptionRequest } from '../api/adoptions-api';

interface AdoptionTarget {
  organizationId: string;
  animal: AdoptionAnimalSnapshot;
}

/**
 * Resolve the animal + owning org from navigation state or query params. In the
 * finished flow this comes from the PUBLIC animals catalog (M03 integration
 * point, `GET /public/organizations/:slug/animals`); until that endpoint exists,
 * the page simply consumes whatever the caller passed. Never fabricates data.
 */
function useAdoptionTarget(): AdoptionTarget | null {
  const location = useLocation();
  const [params] = useSearchParams();
  return useMemo(() => {
    const state = (location.state as { target?: AdoptionTarget } | null)?.target;
    if (state?.organizationId && state.animal?.animalId) return state;

    const organizationId = params.get('organizationId');
    const animalId = params.get('animalId');
    const name = params.get('name');
    const species = params.get('species') as AnimalSpecies | null;
    if (organizationId && animalId && name && species) {
      return {
        organizationId,
        animal: { animalId, name, species, photoUrl: params.get('photoUrl') ?? undefined },
      };
    }
    return null;
  }, [location.state, params]);
}

/**
 * `/adopciones/solicitar` — postulación de adopción de una PERSONA autenticada
 * (§M04, RF10). Mensaje mínimo argumentado; el backend impone unicidad (una
 * solicitud activa por animal) y el conflicto de interés (no adoptar de tu propia
 * organización). Dato personal bajo Ley 1581.
 */
export function AdoptionRequestPage() {
  const client = useApiClient();
  const { user } = useSession();
  const { toast } = useToast();
  const target = useAdoptionTarget();

  const [fullName, setFullName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [touched, setTouched] = useState<{ fullName?: boolean; email?: boolean }>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const fullNameError = validateRequired(fullName, 'El nombre completo');
  const emailError = validateEmail(email);
  const showFullNameError = touched.fullName || attemptedSubmit ? fullNameError : undefined;
  const showEmailError = touched.email || attemptedSubmit ? emailError : undefined;

  const remaining = Math.max(0, ADOPTION_MESSAGE_MIN_LENGTH - message.trim().length);
  const canSubmit = Boolean(target) && remaining === 0 && !fullNameError && !emailError;

  if (!target) {
    return (
      <PageContainer>
        <PageHeader title="Solicitar adopción" description="Postúlate para adoptar un animal." />
        <EmptyState
          title="Elige un animal desde el catálogo"
          description="Esta pantalla recibe el animal desde el catálogo público de la organización. Vuelve al catálogo y elige un animal para continuar."
        />
      </PageContainer>
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttemptedSubmit(true);
    void submit();
  };

  const submit = async () => {
    if (!canSubmit || !target) return;
    setSubmitting(true);
    try {
      await createAdoptionRequest(client, {
        animalId: target.animal.animalId,
        organizationId: target.organizationId,
        animalSnapshot: target.animal,
        applicant: {
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
        },
        message: message.trim(),
      });
      setDone(true);
      toast({ title: 'Solicitud enviada', description: 'La organización la revisará pronto.' });
    } catch (error) {
      const status = (error as { status?: number }).status;
      toast({
        title: 'No se pudo enviar la solicitud',
        description:
          status === 409
            ? 'Ya tienes una solicitud activa para este animal.'
            : status === 403
              ? 'No puedes postular a un animal de tu propia organización.'
              : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Solicitar adopción"
        description={`Postulación para ${target.animal.name}.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>{target.animal.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {done ? (
            <EmptyState
              title="¡Solicitud registrada!"
              description="Tu solicitud quedó en estado «Nuevas». La organización te contactará al evaluarla."
            />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium" htmlFor="adoption-full-name">
                  Nombre completo
                  <Input
                    id="adoption-full-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, fullName: true }))}
                    required
                    aria-invalid={showFullNameError ? true : undefined}
                    aria-describedby={showFullNameError ? 'adoption-full-name-error' : undefined}
                  />
                  {showFullNameError && (
                    <p
                      id="adoption-full-name-error"
                      role="alert"
                      className="text-xs text-destructive"
                    >
                      {showFullNameError}
                    </p>
                  )}
                </label>
                <label className="space-y-1.5 text-sm font-medium" htmlFor="adoption-email">
                  Correo
                  <Input
                    id="adoption-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                    required
                    aria-invalid={showEmailError ? true : undefined}
                    aria-describedby={showEmailError ? 'adoption-email-error' : undefined}
                  />
                  {showEmailError && (
                    <p id="adoption-email-error" role="alert" className="text-xs text-destructive">
                      {showEmailError}
                    </p>
                  )}
                </label>
                <label className="space-y-1.5 text-sm font-medium" htmlFor="adoption-phone">
                  Teléfono (opcional)
                  <Input
                    id="adoption-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              </div>
              <label className="space-y-1.5 text-sm font-medium" htmlFor="adoption-message">
                ¿Por qué quieres adoptar a {target.animal.name}?
              </label>
              <textarea
                id="adoption-message"
                className="min-h-28 w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                aria-describedby="adoption-message-hint"
              />
              <p id="adoption-message-hint" className="text-xs text-muted-foreground">
                {remaining > 0
                  ? `Faltan ${remaining} caracteres (mínimo ${ADOPTION_MESSAGE_MIN_LENGTH}).`
                  : 'Mensaje listo.'}
              </p>
              <Button type="submit" disabled={!canSubmit || submitting}>
                {submitting ? 'Enviando…' : 'Enviar solicitud'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
