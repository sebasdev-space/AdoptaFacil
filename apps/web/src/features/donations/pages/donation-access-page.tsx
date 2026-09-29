import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { GuestDonationAccess } from '@adoptafacil/contracts';
import {
  Badge,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Skeleton,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { fetchGuestDonationAccess } from '../api/donations-api';
import { formatBogota, formatCop } from '../model/donation-breakdown-view';
import { DONATION_STATUS_BADGE_VARIANT, DONATION_STATUS_LABELS } from '../model/my-donations-view';
import styles from './donation-access-page.module.scss';

type AccessState = 'loading' | 'found' | 'invalid' | 'error';

/**
 * `/donaciones/comprobante?token=…` — comprobante de un donante INVITADO
 * (client requirement, final): "tampoco quiero obligar al donante a
 * registrarse para volver a consultar su donación... acceso seguro mediante
 * magic link... con un enlace/token único, no enumerable y con expiración".
 * PUBLIC route — no session, no `<RequireAuth>` (same SEAM as `/donaciones`
 * itself and `/verificar/:code`): the token IS the credential, read from the
 * query string (same convention as `DonatePage`'s `organizationId`).
 *
 * A 404 from `GET /public/donations/access/:token` (missing, malformed,
 * unknown, OR expired token — the backend never distinguishes which) always
 * renders the SAME honest "no es válido o expiró" message — this page must
 * never imply whether a donation with that data might exist.
 */
export function DonationAccessPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<AccessState>('loading');
  const [data, setData] = useState<GuestDonationAccess | null>(null);

  useEffect(() => {
    if (!token) {
      setState('invalid');
      return;
    }
    let cancelled = false;
    setState('loading');
    fetchGuestDonationAccess(token)
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
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="flex-1">
        <PageContainer>
          <PageHeader
            title="Tu comprobante de donación"
            description="Consulta el estado de tu donación con el enlace que te enviamos por correo — no necesitas una cuenta."
          />

          {state === 'loading' && <Skeleton className="h-48 w-full" data-testid="access-loading" />}

          {state === 'invalid' && (
            <EmptyState
              data-testid="access-invalid"
              title="Este enlace no es válido o expiró"
              description="Revisa que copiaste el enlace completo desde tu correo. Si el problema persiste, escríbenos."
            />
          )}

          {state === 'error' && (
            <EmptyState
              data-testid="access-error"
              title="No pudimos cargar tu comprobante"
              description="Inténtalo de nuevo en un momento."
            />
          )}

          {state === 'found' && data && (
            <Card data-testid="guest-donation-access-result">
              <CardHeader className="gap-2">
                <div className={styles['result__title-row']}>
                  <CardTitle>{data.donation.organizationName ?? 'Tu donación'}</CardTitle>
                  <Badge variant={DONATION_STATUS_BADGE_VARIANT[data.donation.status]}>
                    {DONATION_STATUS_LABELS[data.donation.status]}
                  </Badge>
                </div>
                <p className={styles['result__date']}>{formatBogota(data.donation.createdAt)}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className={styles.fields}>
                  <div>
                    <dt className={styles['fields__label']}>Monto donado</dt>
                    <dd className={styles['fields__value']} data-testid="access-amount">
                      {formatCop(data.donation.amountCharged)}
                    </dd>
                  </div>
                </dl>

                {data.donation.status === 'pending' && (
                  <p className={styles.hint} data-testid="access-pending-hint">
                    Aún estamos confirmando tu pago. Tu recibo se emitirá automáticamente en cuanto
                    se apruebe — vuelve a abrir este mismo enlace más tarde.
                  </p>
                )}

                {data.donation.status === 'declined' && (
                  <p className={styles.hint} data-testid="access-declined-hint">
                    El pago no fue aprobado. Si quieres intentarlo de nuevo, vuelve al portal de la
                    organización y dona otra vez.
                  </p>
                )}

                {data.receipt && (
                  <div className={styles.receipt} data-testid="access-receipt">
                    <p className={styles['receipt__label']}>Recibo emitido</p>
                    <p className={styles['receipt__date']}>{formatBogota(data.receipt.issuedAt)}</p>
                  </div>
                )}

                {data.certificate && (
                  <Link
                    to={`/verificar/${encodeURIComponent(data.certificate.code)}`}
                    className={cn(buttonVariants())}
                    data-testid="access-view-certificate"
                  >
                    Ver certificado de donación
                  </Link>
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
