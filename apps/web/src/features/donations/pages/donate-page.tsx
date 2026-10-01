import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { Donation } from '@adoptafacil/contracts';
import {
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { isIncompleteProfileError, useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { createDonation } from '../api/donations-api';
import { DonateForm, type DonateFormValues } from '../components/donate-form';
import { MyDonationsList } from '../components/my-donations-list';
import { formatCop } from '../model/donation-breakdown-view';
import styles from './donate-page.module.scss';

interface DonationTarget {
  organizationId: string;
  organizationName: string;
  /** F2-03: presentación únicamente — vienen de `OrganizationPublic` vía
   *  `buildDonateHref` (portal, T-050/F2-03), nunca refetcheados aquí. */
  organizationLogoUrl?: string;
  organizationCity?: string;
  organizationNit?: string;
}

/**
 * Resolve the beneficiary org from navigation state or query params. In the finished
 * flow this comes from the PUBLIC org portal (§M14, `/o/:slug` → "Donar"); until that
 * link exists, the page consumes whatever the caller passed. Never fabricates data.
 */
function useDonationTarget(): DonationTarget | null {
  const location = useLocation();
  const [params] = useSearchParams();
  return useMemo(() => {
    const state = (location.state as { target?: DonationTarget } | null)?.target;
    if (state?.organizationId && state.organizationName) return state;

    const organizationId = params.get('organizationId');
    const organizationName = params.get('organizationName');
    if (organizationId && organizationName) {
      return {
        organizationId,
        organizationName,
        organizationLogoUrl: params.get('organizationLogoUrl') ?? undefined,
        organizationCity: params.get('organizationCity') ?? undefined,
        organizationNit: params.get('organizationNit') ?? undefined,
      };
    }
    return null;
  }, [location.state, params]);
}

/**
 * `/donaciones` — donación a una organización (§M05, P1 + checkout de INVITADO,
 * requisito final del cliente: donar NUNCA exige cuenta ni login). Ve el desglose
 * transparente antes de pagar (misma cuenta que el backend), puede marcar
 * "cubro la comisión" y la donación anónima frente a la organización, y al
 * confirmarse el pago (webhook) se emite un recibo automático. Dato personal
 * bajo Ley 1581.
 *
 * SEAM resuelto: la ruta vive FUERA de `<RequireAuth>`/`<AppLayout>` (ver
 * routes.tsx) — esta página arma su propio chrome público (mismo patrón que
 * `PublicCampaignsPage`) y lee `useSession()` directamente para decidir si
 * prellena la identidad del donante (con sesión) o pide nombre+correo
 * (invitado). `POST /donations` acepta ambos casos (`OptionalJwtAuthGuard`).
 */
export function DonatePage() {
  const client = useApiClient();
  const { status, user } = useSession();
  const hasSession = status === 'authenticated';
  const { toast } = useToast();
  const target = useDonationTarget();
  const location = useLocation();
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Donation | null>(null);
  // Remounts <DonateForm> with fresh internal state ("Intentar con otra
  // tarjeta" after a declined charge, T-OrdersAPI) — the form owns its own
  // amount/step state, so a plain re-render alone wouldn't reset it.
  const [formInstanceKey, setFormInstanceKey] = useState(0);

  if (!target) {
    // Reached from the "Donaciones" menu entry (no org target): T-064 completes
    // this branch with the donor's OWN donation history, previously just a
    // static empty-state. Starting a NEW donation still only happens from an
    // org's public portal (/o/:slug → "Donar"), never listed/picked here.
    // `GET /donations/mine` stays authenticated-only (out of scope here) — a
    // visitor with no session gets an honest prompt instead of a failed fetch.
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <PublicNavbar />
        <main className="flex-1">
          <PageContainer>
            {hasSession ? (
              <>
                <PageHeader
                  title="Mis donaciones"
                  description="Historial de tus donaciones. Para donar, entra al portal público de una organización."
                />
                <MyDonationsList />
              </>
            ) : (
              <>
                <PageHeader
                  title="Donaciones"
                  description="Entra al portal público de una organización para donar — no necesitas una cuenta."
                />
                <EmptyState
                  title="Aún no elegiste a quién donar"
                  description="Explora el catálogo general o el portal de una organización y usa su botón “Donar”."
                />
                <p className={styles['done__hint']}>
                  ¿Ya donaste antes con una cuenta?{' '}
                  <Link to="/login" className="underline">
                    Inicia sesión
                  </Link>{' '}
                  para ver tu historial.
                </p>
              </>
            )}
          </PageContainer>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const donate = async ({
    intendedAmount,
    commissionPayer,
    anonymous,
    guestPayer,
    cardToken,
    paymentMethodId,
    paymentMethodType,
    installments,
  }: DonateFormValues): Promise<void> => {
    setSubmitting(true);
    try {
      const donation = await createDonation(client, {
        organizationId: target.organizationId,
        intendedAmount,
        commissionPayer,
        anonymous,
        // Con sesión: se prellena del donante autenticado (como antes). Sin
        // sesión (invitado): viene del propio formulario, requerido allí.
        payer: hasSession
          ? user?.email
            ? { fullName: user.name, email: user.email }
            : undefined
          : guestPayer,
        // Idempotencia: el servidor deduplica por (org, key); una clave por intento.
        idempotencyKey: crypto.randomUUID(),
        // T-OrdersAPI (Checkout API/Orders): reemplaza el antiguo redirect de
        // Checkout Pro — la tarjeta ya fue tokenizada por el Card Payment
        // Brick (paso 2 de DonateForm) ANTES de llegar aquí.
        cardToken,
        paymentMethodId,
        paymentMethodType,
        installments,
      });
      setDone(donation);
      toast(
        donation.status === 'approved'
          ? {
              title: '¡Pago aprobado!',
              description: 'Te enviaremos el recibo automático por correo.',
            }
          : donation.status === 'declined'
            ? {
                title: 'Pago rechazado',
                description:
                  'Tu banco o MercadoPago rechazaron el pago. Puedes intentarlo de nuevo.',
                variant: 'destructive',
              }
            : {
                title: 'Donación registrada',
                description:
                  'Estamos confirmando tu pago. Te enviaremos el recibo automático al aprobarse.',
              },
      );
    } catch (error) {
      // T-Google-SignIn (business rule #3): donating requires a complete
      // profile (phone/documentId/address) — send the person to complete it,
      // then let them retry the donation themselves from where they left off.
      if (isIncompleteProfileError(error)) {
        navigate('/perfil/completar', {
          state: {
            from: location,
            reason: 'Antes de donar necesitamos tu teléfono, documento de identidad y dirección.',
          },
        });
        return;
      }
      toast({
        title: 'No se pudo procesar la donación',
        description: 'Inténtalo de nuevo en un momento.',
        variant: 'destructive',
      });
      // Re-throw: the Card Payment Brick awaits this promise and shows its
      // OWN error state when it rejects (see CardPaymentBrick's doc comment)
      // — swallowing it here would leave the Brick stuck "processing".
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  const retryWithAnotherCard = () => {
    setDone(null);
    setFormInstanceKey((k) => k + 1);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="flex-1">
        <PageContainer>
          <PageHeader title="Donar" description={`Tu aporte para ${target.organizationName}.`} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {target.organizationLogoUrl && (
                  <img
                    src={target.organizationLogoUrl}
                    alt=""
                    aria-hidden
                    data-testid="donation-org-logo"
                    className={styles['org-logo']}
                  />
                )}
                {target.organizationName}
              </CardTitle>
              {/* F2-03: solo lo que ya viaja en el contrato público (mismo endpoint
                  que el portal /o/:slug consume) — el NIT es dato público una vez
                  formalizada la org, nunca se fabrica ni se muestra el de muestra
                  del certificado (RF14, congelado, no se toca aquí). */}
              {(target.organizationCity || target.organizationNit) && (
                <p className={styles['org-meta']} data-testid="donation-org-meta">
                  {[
                    target.organizationCity,
                    target.organizationNit && `NIT ${target.organizationNit}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </CardHeader>
            <CardContent>
              {hasSession && user?.name && (
                <p className={styles['donor-identity']} data-testid="donor-identity">
                  Donando como <span className={styles['donor-identity__name']}>{user.name}</span>
                  {user.email && ` (${user.email})`}
                </p>
              )}
              {done ? (
                done.status === 'declined' ? (
                  // T-OrdersAPI: a declined charge is a SUCCESSFUL API call
                  // (the request itself succeeded; the gateway rejected the
                  // card) — no certificate/account CTA, just an honest
                  // message + a way to try a different card.
                  <div className={styles.done} data-testid="donation-declined">
                    <EmptyState
                      title="Tu pago no fue aprobado"
                      description="MercadoPago o tu banco rechazaron el pago. Puedes intentarlo de nuevo con otra tarjeta."
                    />
                    <Button onClick={retryWithAnotherCard} data-testid="donation-retry-card">
                      Intentar con otra tarjeta
                    </Button>
                  </div>
                ) : (
                  <div className={styles.done}>
                    <EmptyState
                      title="¡Gracias por tu donación!"
                      description={
                        done.status === 'approved'
                          ? `Tu pago de ${formatCop(done.amountCharged)} fue aprobado. Te enviaremos el recibo automático por correo.`
                          : `Registramos tu donación de ${formatCop(done.amountCharged)}. Cuando el pago se confirme, te emitiremos el recibo automáticamente.`
                      }
                    />
                    {/* Empalme al certificado REAL (§M05/RF14, F-3): solo un ENLACE, la
                        lógica de donación no cambia. Lleva únicamente el id de la
                        donación — el certificado se lee del backend, no se reconstruye
                        desde nav-state. */}
                    <div className={styles['done__cert']}>
                      <Link
                        to="/certificado"
                        state={{ donationId: done.id }}
                        className={cn(buttonVariants())}
                        data-testid="view-certificate-cta"
                      >
                        Ver tu certificado de donación
                      </Link>
                      <p className={styles['done__hint']}>
                        Disponible una vez se confirme tu pago (organizaciones ESAL con RTE
                        vigente).
                      </p>
                    </div>
                    {/* Checkout de invitado: la cuenta se ofrece DESPUÉS de donar, nunca
                        como precondición (requisito del cliente). Solo tiene sentido para
                        quien donó sin sesión — un donante ya autenticado no la necesita. */}
                    {!hasSession && (
                      <div className={styles['done__cert']}>
                        <p className={styles['done__hint']}>
                          ¿Quieres crear una cuenta gratuita en AdoptaFácil para consultar tu
                          historial de donaciones?
                        </p>
                        <Link
                          to="/register"
                          className={cn(buttonVariants({ variant: 'outline' }))}
                          data-testid="create-account-cta"
                        >
                          Crear cuenta gratuita
                        </Link>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <DonateForm
                  key={formInstanceKey}
                  organizationName={target.organizationName}
                  submitting={submitting}
                  hasSession={hasSession}
                  sessionEmailHint={hasSession ? user?.email : undefined}
                  onDonate={donate}
                />
              )}
            </CardContent>
          </Card>
        </PageContainer>
      </main>
      <PublicFooter />
    </div>
  );
}
