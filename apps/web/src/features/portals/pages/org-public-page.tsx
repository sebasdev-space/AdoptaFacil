import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { OrganizationPublic, PortalTheme, PortalView } from '@adoptafacil/contracts';
import { EmptyState, Skeleton } from '@adoptafacil/ui';
import { brandTokensToStyle } from '../../../shell/theme';
import { buildPortalView } from '../model/portal-view';
import { safePortalTheme } from '../model/theme';
import { PortalProfileSection } from '../components/portal-profile-section';
import { PortalPlaceholderSection } from '../components/portal-placeholder-section';
import { PortalTransparencyBar } from '../components/portal-transparency-bar';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * PUBLIC organization PORTAL at `/o/:slug` (§M14). Rendered OUTSIDE the app shell
 * and WITHOUT authentication: it fetches the public projection directly (no token),
 * so it only ever shows public fields the backend chooses to expose (never
 * phone/legalName; NIT only once formalized).
 *
 * The portal is a rich, multi-section page:
 *  - a persistent transparency indicator with REAL derived data (§M14, T-027):
 *    nivel (verificationLevel) · % formalización (derivado) · rendición (placeholder).
 *  - "perfil" — the organization's real public identity, read straight from the
 *    `OrganizationPublic` contract (inherits any public-field change by contract),
 *    including the reserved org-type badge slot.
 *  - aggregated sections (mascotas / campaña / necesita hoy / transparencia) —
 *    structured PLACEHOLDERS with their integration point, wired when their owning
 *    modules exist (see docs/TASKS.md · deuda de cableado M14).
 *
 * PERSONALIZATION (T-027): the org's brand tokens are fetched and applied at
 * runtime as CSS custom properties on a SCOPED wrapper (not the global <html>), so
 * the portal re-brands without affecting anything else and without arbitrary CSS —
 * only the safe, validated token subset is ever applied.
 */
export function OrgPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [view, setView] = useState<PortalView | null>(null);
  const [theme, setTheme] = useState<PortalTheme>({});
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!slug) {
      setState('not-found');
      return;
    }
    let active = true;
    const encoded = encodeURIComponent(slug);

    // The profile drives the page state (404/error). The theme is best-effort:
    // if it fails or is absent, the portal simply renders the default design.
    const profile = fetch(`${API_BASE}/public/organizations/${encoded}`).then((response) => {
      if (response.status === 404) throw new Error('not-found');
      if (!response.ok) throw new Error('error');
      return response.json() as Promise<OrganizationPublic>;
    });

    const brand = fetch(`${API_BASE}/public/organizations/${encoded}/theme`)
      .then((response) => (response.ok ? (response.json() as Promise<{ tokens?: unknown }>) : null))
      .then((body) => safePortalTheme(body?.tokens))
      .catch(() => ({}) as PortalTheme);

    profile
      .then(async (data) => {
        const tokens = await brand;
        if (!active) return;
        setView(buildPortalView(data));
        setTheme(tokens);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (active)
          setState(err instanceof Error && err.message === 'not-found' ? 'not-found' : 'error');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  // Only the safe token subset ever reaches inline styles (custom properties
  // cannot execute script; unknown keys were already filtered out).
  const themeStyle = useMemo(() => brandTokensToStyle(theme), [theme]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6" style={themeStyle}>
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
      {state === 'ready' && view && (
        <div className="space-y-8">
          <div className="flex justify-end">
            <PortalTransparencyBar organization={view.profile.organization} />
          </div>
          <PortalProfileSection profile={view.profile} />
          {view.sections.map((section) => (
            <PortalPlaceholderSection key={section.kind} section={section} />
          ))}
        </div>
      )}
    </main>
  );
}
