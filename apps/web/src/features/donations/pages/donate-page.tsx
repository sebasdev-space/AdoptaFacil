import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { Donation } from '@adoptafacil/contracts';
import {
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
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { createDonation } from '../api/donations-api';
import { DonateForm, type DonateFormValues } from '../components/donate-form';
import { MyDonationsList } from '../components/my-donations-list';
import { formatCop } from '../model/donation-breakdown-view';

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
 * `/donar` — donación de una PERSONA autenticada a una organización (§M05, P1). Ve el
 * desglose transparente antes de pagar (misma cuenta que el backend), puede marcar
 * "cubro la comisión", y al confirmarse el pago (webhook) se emite un recibo
 * automático. Dato personal bajo Ley 1581.
 */
export function DonatePage() {
  const client = useApiClient();
  const { user } = useSession();
  const { toast } = useToast();
  const target = useDonationTarget();

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Donation | null>(null);

  if (!target) {
    // Reached from the "Donaciones" menu entry (no org target): T-064 completes
    // this branch with the donor's OWN donation history, previously just a
    // static empty-state. Starting a NEW donation still only happens from an
    // org's public portal (/o/:slug → "Donar"), never listed/picked here.
    return (
      <PageContainer>
        <PageHeader
          title="Mis donaciones"
          description="Historial de tus donaciones. Para donar, entra al portal público de una organización."
        />
        <MyDonationsList />
      </PageContainer>
    );
  }

  const donate = async ({ intendedAmount, commissionPayer }: DonateFormValues) => {
    setSubmitting(true);
    try {
      const donation = await createDonation(client, {
        organizationId: target.organizationId,
        intendedAmount,
        commissionPayer,
        payer: user?.email ? { fullName: user.name, email: user.email } : undefined,
        // Idempotencia: el servidor deduplica por (org, key); una clave por intento.
        idempotencyKey: crypto.randomUUID(),
      });
      setDone(donation);
      toast({
        title: 'Donación registrada',
        description: 'Te enviaremos el recibo automático al confirmarse el pago.',
      });
    } catch {
      toast({
        title: 'No se pudo procesar la donación',
        description: 'Inténtalo de nuevo en un momento.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
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
                className="h-8 w-8 rounded-full object-cover"
              />
            )}
            {target.organizationName}
          </CardTitle>
          {/* F2-03: solo lo que ya viaja en el contrato público (mismo endpoint
              que el portal /o/:slug consume) — el NIT es dato público una vez
              formalizada la org, nunca se fabrica ni se muestra el de muestra
              del certificado (RF14, congelado, no se toca aquí). */}
          {(target.organizationCity || target.organizationNit) && (
            <p className="text-xs text-muted-foreground" data-testid="donation-org-meta">
              {[target.organizationCity, target.organizationNit && `NIT ${target.organizationNit}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {user?.name && (
            <p className="mb-4 text-sm text-muted-foreground" data-testid="donor-identity">
              Donando como <span className="font-medium text-foreground">{user.name}</span>
              {user.email && ` (${user.email})`}
            </p>
          )}
          {done ? (
            <div className="space-y-4">
              <EmptyState
                title="¡Gracias por tu donación!"
                description={`Registramos tu donación de ${formatCop(done.amountCharged)}. Cuando el pago se confirme, te emitiremos el recibo automáticamente.`}
              />
              {/* Empalme al recorrido del certificado (§M05/RF14, T-053). Solo un
                  ENLACE: la lógica de donación no cambia. Lleva la donación real +
                  el nombre de la org (T-066, ya en scope como `target.organizationName`)
                  por nav-state para reflejar datos reales en la maqueta del certificado. */}
              <div className="flex flex-col items-center gap-1 text-center">
                <Link
                  to="/certificado"
                  state={{ donation: done, organizationName: target.organizationName }}
                  className={cn(buttonVariants())}
                  data-testid="view-certificate-cta"
                >
                  Ver tu certificado de donación
                </Link>
                <p className="text-xs text-muted-foreground">
                  Vista previa: anticipo del certificado verificable.
                </p>
              </div>
            </div>
          ) : (
            <DonateForm
              organizationName={target.organizationName}
              submitting={submitting}
              onDonate={(values) => void donate(values)}
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
