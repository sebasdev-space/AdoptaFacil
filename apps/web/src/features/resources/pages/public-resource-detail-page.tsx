import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { ResourceNeedPublic } from '@adoptafacil/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  buttonVariants,
  cn,
} from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { getPublicNeed } from '../api/public-resources';
import { NeedProgress } from '../components/need-progress';
import { CATEGORY_LABELS, NEED_STATUS_LABELS, needStatusVariant } from '../model/resources-view';

type DetailState = 'loading' | 'ready' | 'not-found' | 'error';

interface NeedNavState {
  need?: ResourceNeedPublic;
}

/**
 * Detalle PÚBLICO de una necesidad (M09, F-6) en `/recursos/:id`. Sin
 * autenticación; columnas públicas de `ResourceNeedPublic`. Llega por
 * nav-state desde la tarjeta o se resuelve por `GET /public/resources/needs/:id`
 * en deep-link (404 → no encontrado). "Quiero ayudar" enlaza a `/ofrecer`
 * (autenticada, mismo SEAM que "Donar" en el portal de campañas/donaciones —
 * el gate de sesión lo impone esa ruta, no esta).
 */
export function PublicResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const preloaded = (location.state as NeedNavState | null)?.need;

  const [need, setNeed] = useState<ResourceNeedPublic | null>(preloaded ?? null);
  const [state, setState] = useState<DetailState>(preloaded ? 'ready' : 'loading');

  useEffect(() => {
    if (preloaded || !id) {
      if (!id) setState('not-found');
      return;
    }
    let active = true;
    getPublicNeed(id)
      .then((found) => {
        if (!active) return;
        setNeed(found);
        setState(found ? 'ready' : 'not-found');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [preloaded, id]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <Link to="/recursos" className="text-sm text-primary hover:underline">
          ← Volver al banco de recursos
        </Link>

        <div className="mt-4">
          {state === 'loading' && <Skeleton className="h-72 w-full" />}
          {state === 'not-found' && (
            <EmptyState
              title="Necesidad no encontrada"
              description="Esta necesidad no existe o el enlace no es válido."
            />
          )}
          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}
          {state === 'ready' && need && (
            <Card data-testid="public-need-detail">
              <CardHeader className="gap-2">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {need.title}
                  <Badge variant="secondary">{CATEGORY_LABELS[need.category]}</Badge>
                  <Badge variant={needStatusVariant(need.status)}>
                    {NEED_STATUS_LABELS[need.status]}
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{need.organizationName}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {need.description && <p className="text-sm text-foreground">{need.description}</p>}
                <NeedProgress
                  quantityFulfilled={need.quantityFulfilled}
                  quantityNeeded={need.quantityNeeded}
                  unit={need.unit}
                  progress={need.progress}
                />
                <Link
                  to={`/ofrecer?needId=${encodeURIComponent(need.id)}&needTitle=${encodeURIComponent(
                    need.title,
                  )}&unit=${encodeURIComponent(need.unit)}&organizationName=${encodeURIComponent(
                    need.organizationName,
                  )}`}
                  className={cn(buttonVariants(), 'w-full sm:w-auto')}
                  data-testid="offer-cta"
                >
                  Quiero ayudar con esto
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
