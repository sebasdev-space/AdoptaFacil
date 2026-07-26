import { useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { Donation } from '@adoptafacil/contracts';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, useToast } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { createDonation } from '../api/donations-api';
import { DonateForm, type DonateFormValues } from '../components/donate-form';
import { formatCop } from '../model/donation-breakdown-view';

interface DonationTarget {
  organizationId: string;
  organizationName: string;
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
    if (organizationId && organizationName) return { organizationId, organizationName };
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
    return (
      <PageContainer>
        <PageHeader title="Donar" description="Apoya a una organización de rescate." />
        <EmptyState
          title="Elige una organización desde su portal"
          description="Esta pantalla recibe la organización desde su portal público (integración con M14: /o/:slug → «Donar»). Aún no hay una organización seleccionada."
        />
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
          <CardTitle>{target.organizationName}</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <EmptyState
              title="¡Gracias por tu donación!"
              description={`Registramos tu donación de ${formatCop(done.amountCharged)}. Cuando el pago se confirme, te emitiremos el recibo automáticamente.`}
            />
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
