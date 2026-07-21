import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@adoptafacil/ui';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * PUBLIC organization portal at `/o/:slug` (§M14). Rendered OUTSIDE the app
 * shell and WITHOUT authentication: it fetches the public projection directly
 * (no token), so it only ever shows public fields the backend chooses to expose
 * (never phone/legalName; NIT only once formalized).
 */
export function OrgPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [org, setOrg] = useState<OrganizationPublic | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!slug) {
      setState('not-found');
      return;
    }
    let active = true;
    fetch(`${API_BASE}/public/organizations/${encodeURIComponent(slug)}`)
      .then((response) => {
        if (response.status === 404) throw new Error('not-found');
        if (!response.ok) throw new Error('error');
        return response.json() as Promise<OrganizationPublic>;
      })
      .then((data) => {
        if (active) {
          setOrg(data);
          setState('ready');
        }
      })
      .catch((err: unknown) => {
        if (active)
          setState(err instanceof Error && err.message === 'not-found' ? 'not-found' : 'error');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      {state === 'loading' && <Skeleton className="h-72 w-full" />}
      {state === 'not-found' && (
        <EmptyState
          title="Organización no encontrada"
          description="El enlace no corresponde a ninguna organización."
        />
      )}
      {state === 'error' && (
        <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
      )}
      {state === 'ready' && org && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {org.name}
              {org.rteVigente && <Badge>RTE vigente</Badge>}
              {org.verificationLevel && (
                <Badge variant="secondary">Verificación nivel {org.verificationLevel.level}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {org.description && <p className="text-sm text-foreground">{org.description}</p>}
            <dl className="grid gap-4 sm:grid-cols-2">
              {org.location?.city && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Ubicación</dt>
                  <dd className="text-sm">
                    {[org.location.city, org.location.department, org.location.country]
                      .filter(Boolean)
                      .join(', ')}
                  </dd>
                </div>
              )}
              {org.contactEmail && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Correo</dt>
                  <dd className="text-sm">{org.contactEmail}</dd>
                </div>
              )}
              {org.whatsapp && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">WhatsApp</dt>
                  <dd className="text-sm">{org.whatsapp}</dd>
                </div>
              )}
              {org.nit && (
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">NIT</dt>
                  <dd className="text-sm">{org.nit}</dd>
                </div>
              )}
            </dl>
            {org.socialLinks?.website && (
              <a
                href={org.socialLinks.website}
                className="text-sm font-medium text-primary hover:underline"
                rel="noreferrer"
                target="_blank"
              >
                Sitio web
              </a>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
