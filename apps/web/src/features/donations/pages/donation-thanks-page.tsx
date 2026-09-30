import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DonationPublicStatus } from '@adoptafacil/contracts';
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
import { fetchDonationPublicStatus } from '../api/donations-api';
import { formatCop } from '../model/donation-breakdown-view';
import { DONATION_STATUS_BADGE_VARIANT, DONATION_STATUS_LABELS } from '../model/my-donations-view';
import styles from './donation-access-page.module.scss';

type ThanksState = 'loading' | 'found' | 'invalid' | 'error';

/**
 * `/donaciones/gracias?external_reference=…` — landing REAL tras el checkout
 * de MercadoPago (bug fix: hasta ahora `paymentLinkUrl` se descartaba y el
 * donante nunca era enviado a pagar de verdad). `back_urls`/`auto_return` de
 * `MercadoPagoPaymentAdapter.createCollection` traen de vuelta al donante a
 * ESTA ruta, con `external_reference` (== nuestro propio `collectionId`) en
 * la query string. PUBLIC — no session, no `<RequireAuth>` (mismo SEAM que
 * `/donaciones`/`/donaciones/comprobante`): en vez de confiar en los query
 * params propios de MercadoPago (forma no documentada/estable), esta página
 * SOLO lee `external_reference` y resuelve todo lo demás contra
 * `GET /public/donations/status/:reference` (status/monto/nombre de la org,
 * nunca la identidad del donante).
 *
 * Es el aterrizaje INMEDIATO post-pago, no el mecanismo durable de "consultar
 * mi donación más tarde" — para un invitado, ese es el magic link que ya se
 * envía por correo desde el webhook (sin relación con esta página); para un
 * donante autenticado, ya existe `/donaciones` → "Mis donaciones".
 */
export function DonationThanksPage() {
  const [params] = useSearchParams();
  const reference = params.get('external_reference') ?? '';
  const [state, setState] = useState<ThanksState>('loading');
  const [data, setData] = useState<DonationPublicStatus | null>(null);

  useEffect(() => {
    if (!reference) {
      setState('invalid');
      return;
    }
    let cancelled = false;
    setState('loading');
    fetchDonationPublicStatus(reference)
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
            title="¡Gracias por tu donación!"
            description="Estamos confirmando tu pago con MercadoPago."
          />

          {state === 'loading' && <Skeleton className="h-48 w-full" data-testid="thanks-loading" />}

          {state === 'invalid' && (
            <EmptyState
              data-testid="thanks-invalid"
              title="No pudimos encontrar tu donación"
              description="Si ya completaste el pago, revisa tu correo: te enviaremos la confirmación automática en cuanto se apruebe."
            />
          )}

          {state === 'error' && (
            <EmptyState
              data-testid="thanks-error"
              title="No pudimos cargar el estado de tu donación"
              description="Inténtalo de nuevo en un momento."
            />
          )}

          {state === 'found' && data && (
            <Card data-testid="donation-thanks-result">
              <CardHeader className="gap-2">
                <div className={styles['result__title-row']}>
                  <CardTitle>{data.organizationName}</CardTitle>
                  <Badge variant={DONATION_STATUS_BADGE_VARIANT[data.status]}>
                    {DONATION_STATUS_LABELS[data.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p data-testid="thanks-amount">{formatCop(data.amountCharged)}</p>

                {data.status === 'pending' && (
                  <p className={styles.hint} data-testid="thanks-pending-hint">
                    Aún estamos confirmando tu pago con MercadoPago. Te enviaremos el recibo
                    automático por correo en cuanto se apruebe.
                  </p>
                )}
                {data.status === 'declined' && (
                  <p className={styles.hint} data-testid="thanks-declined-hint">
                    El pago no fue aprobado. Vuelve al portal de la organización si quieres
                    intentarlo de nuevo.
                  </p>
                )}
                {data.status === 'approved' && (
                  <p className={styles.hint} data-testid="thanks-approved-hint">
                    Revisa tu correo: te enviamos el recibo (y el certificado, si aplica) de forma
                    automática.
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
