import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SponsorshipPaymentPublicStatus } from '@adoptafacil/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { fetchSponsorshipPaymentPublicStatus } from '../api/public-sponsorships';
import {
  formatCop,
  SPONSORSHIP_PAYMENT_STATUS_LABELS,
  sponsorshipPaymentStatusVariant,
} from '../model/sponsorships-view';
import styles from './sponsorship-thanks-page.module.scss';

type ThanksState = 'loading' | 'found' | 'invalid' | 'error';

/**
 * `/apadrinar/gracias?external_reference=…` — landing REAL tras el checkout
 * de MercadoPago para un intento de cobro de apadrinamiento (mismo bug fix
 * que donations: `paymentLinkUrl` existía en `PaymentPort.CollectionResult` y
 * ya se persistía en `sponsorship_payment_attempts.payment_link_url`, pero
 * nunca se ESCRIBÍA — el padrino nunca era enviado a pagar de verdad).
 * `back_urls`/`auto_return` traen de vuelta aquí, con `external_reference`
 * (== el `collectionId` propio del intento) en la query string. PUBLIC — no
 * session: aunque `/apadrinar` (suscribirse/reintentar pago) exige sesión, el
 * aterrizaje post-pago no depende de ella — resuelve todo contra
 * `GET /public/sponsorships/status/:reference` (status/monto/nombre de la
 * org, nunca la identidad del padrino), mismo criterio que
 * `DonationThanksPage`.
 */
export function SponsorshipThanksPage() {
  const [params] = useSearchParams();
  const reference = params.get('external_reference') ?? '';
  const [state, setState] = useState<ThanksState>('loading');
  const [data, setData] = useState<SponsorshipPaymentPublicStatus | null>(null);

  useEffect(() => {
    if (!reference) {
      setState('invalid');
      return;
    }
    let cancelled = false;
    setState('loading');
    fetchSponsorshipPaymentPublicStatus(reference)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setState('invalid');
          return;
        }
        setData(result);
        setState('found');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reference]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="flex-1">
        <PageContainer>
          <PageHeader
            title="¡Gracias por apadrinar!"
            description="Estamos confirmando tu pago con MercadoPago."
          />

          {state === 'loading' && (
            <Skeleton className="h-48 w-full" data-testid="sponsorship-thanks-loading" />
          )}

          {state === 'invalid' && (
            <EmptyState
              data-testid="sponsorship-thanks-invalid"
              title="No pudimos encontrar tu apadrinamiento"
              description="Si ya completaste el pago, entra a “Mis apadrinamientos” en un momento — se actualizará automáticamente."
            />
          )}

          {state === 'error' && (
            <EmptyState
              data-testid="sponsorship-thanks-error"
              title="No pudimos cargar el estado de tu pago"
              description="Inténtalo de nuevo en un momento."
            />
          )}

          {state === 'found' && data && (
            <Card data-testid="sponsorship-thanks-result">
              <CardHeader className={styles['result__title-row']}>
                <CardTitle>{data.organizationName}</CardTitle>
                <Badge variant={sponsorshipPaymentStatusVariant(data.status)}>
                  {SPONSORSHIP_PAYMENT_STATUS_LABELS[data.status]}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <p data-testid="sponsorship-thanks-amount">{formatCop(data.amount)}</p>

                {data.status === 'pending' && (
                  <p className={styles.hint} data-testid="sponsorship-thanks-pending-hint">
                    Aún estamos confirmando tu pago con MercadoPago. Tu apadrinamiento se activará
                    en cuanto se apruebe.
                  </p>
                )}
                {data.status === 'failed' && (
                  <p className={styles.hint} data-testid="sponsorship-thanks-failed-hint">
                    El pago no fue aprobado. Entra a “Mis apadrinamientos” para generar un nuevo
                    enlace de pago.
                  </p>
                )}
                {data.status === 'paid' && (
                  <p className={styles.hint} data-testid="sponsorship-thanks-paid-hint">
                    Tu apadrinamiento ya está activo. Puedes verlo en “Mis apadrinamientos”.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </PageContainer>
      </main>
      <PublicFooter />
    </div>
  );
}
