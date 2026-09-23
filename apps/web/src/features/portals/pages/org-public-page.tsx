import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type {
  OrganizationPublic,
  PortalLogoPosition,
  PortalSocialNavPosition,
  PortalTheme,
  PortalView,
} from '@adoptafacil/contracts';
import { EmptyState, Skeleton } from '@adoptafacil/ui';
import { brandTokensToStyle } from '../../../shell/theme';
import { buildPortalView } from '../model/portal-view';
import { safeLogoPosition, safePortalTheme, safeSocialNavPosition } from '../model/theme';
import { fetchPublicAnimals } from '../api/public-animals';
import { PortalProfileSection } from '../components/portal-profile-section';
import { PortalPlaceholderSection } from '../components/portal-placeholder-section';
import { PortalTransparencyBar } from '../components/portal-transparency-bar';
import { PortalSocialLinks } from '../components/portal-social-links';
import { PortalAdoptionSection } from '../components/portal-adoption-section';
import { PortalProductsSection } from '../components/portal-products-section';
import { PortalNeedsSection } from '../components/portal-needs-section';
import { PortalCampaignsSection } from '../components/portal-campaigns-section';
import { PortalAboutSection } from '../components/portal-about-section';
import { PortalContactInfoSection } from '../components/portal-contact-info-section';
import { PortalHeaderActions } from '../components/portal-header-actions';
import { PortalPublicLedgerSection } from '../components/portal-public-ledger-section';
import { PublicHeader, type PublicHeaderNavItem } from '../components/public-header';
import { PublicFooter } from '../components/public-footer';
import { PortalHelpCta } from '../components/portal-help-cta';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

interface Layout {
  logoPosition: PortalLogoPosition;
  socialNavPosition: PortalSocialNavPosition;
}

const DEFAULT_LAYOUT: Layout = { logoPosition: 'left', socialNavPosition: 'right' };

/**
 * PUBLIC organization PORTAL at `/o/:slug` (§M14). Rendered OUTSIDE the app shell
 * and WITHOUT authentication: it fetches the public projection directly (no token),
 * so it only ever shows public fields the backend chooses to expose (never
 * phone/legalName; NIT only once formalized).
 *
 * The portal is a rich, single-scroll page (rediseño T-D04 — reemplaza el
 * layout de tabs por anclas reales, confirmado con el dueño del producto,
 * `[Excepcion M14]`):
 *  - `PublicHeader` (nav sticky) + hero (`PortalProfileSection`, cover/logo,
 *    nombre, badges de tipo/formalización, stats reales) + `PublicFooter` —
 *    ambos NUEVOS, misma nav (anclas a las secciones reales de abajo).
 *  - the transparency indicator (§M14, T-027) only mounts when it has a REAL
 *    signal to show (verificationLevel > 0) — otherwise it stays unmounted rather
 *    than displaying an always-"No disponible" bar.
 *  - layout de dos columnas: columna principal con "Mascotas en adopción" /
 *    "Productos" / "Necesita hoy" (siempre visibles, ya no detrás de una tab),
 *    y UN panel lateral con "Campaña activa" + "Síguenos" juntos, del lado que
 *    indique `socialNavPosition` (S2-REORG, mismo campo real ya usado para el
 *    logo/sidebar). En mobile el panel lateral se apila debajo. Debajo del
 *    grid: banner "Cómo ayudar" (`PortalHelpCta`), y "Nosotros"/"Información"
 *    como secciones ancladas (antes tabs) que solo aparecen con contenido
 *    real. Todo con los MISMOS componentes/rutas/datos de siempre, solo
 *    reubicados — ver `docs/PLAN-CONTINUACION-SEBASTIAN_2026-09-23.md`.
 *  - aggregated sections still in `status: 'placeholder'` (transparencia — no
 *    owning module yet) are simply NOT mounted, instead of showing an empty
 *    "Próximamente" card; 'pets', 'products' (F-MKT-PORTAL-1), 'needsToday'
 *    (F-NEEDS-PORTAL-1) and 'activeCampaign' (F-CAMPANAS-PORTAL-2, S2-07) are
 *    all wired to real data (see docs/TASKS.md · deuda de cableado M14).
 *
 * PERSONALIZATION (T-027): the org's brand tokens are fetched and applied at
 * runtime as CSS custom properties on a SCOPED wrapper (not the global <html>), so
 * the portal re-brands without affecting anything else and without arbitrary CSS —
 * only the safe, validated token subset is ever applied.
 */
export interface OrgPublicPageProps {
  /**
   * Real-subdomain portal (F-1, M14): when the app resolves the current host
   * to an organization slug (`usePortalSubdomainSlug`), the shell renders this
   * page at `/` with the resolved slug instead of the `:slug` route param —
   * everything below behaves identically either way.
   */
  slugOverride?: string;
}

export function OrgPublicPage({ slugOverride }: OrgPublicPageProps = {}) {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const slug = slugOverride ?? slugParam;
  const [view, setView] = useState<PortalView | null>(null);
  const [theme, setTheme] = useState<PortalTheme>({});
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [state, setState] = useState<LoadState>('loading');
  const [animalTotal, setAnimalTotal] = useState<number | undefined>(undefined);

  // "Adoptar"/"Apadrinar" (pulido visual) no inventan un flujo nuevo: solo
  // desplazan a la sección real "Mascotas en adopción" (rediseño T-D04, ya
  // sin tabs) donde el visitante elige el animal y sigue la ruta que ya
  // existe (ver `PortalHeaderActions`).
  const goToCatalog = () => {
    document
      .getElementById('portal-section-pets')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!slug) {
      setState('not-found');
      return;
    }
    let active = true;
    const encoded = encodeURIComponent(slug);

    // The profile drives the page state (404/error). The theme (colors +
    // layout, S2-PORTAL) is best-effort: if it fails or is absent, the portal
    // simply renders the default design/layout.
    const profile = fetch(`${API_BASE}/public/organizations/${encoded}`).then((response) => {
      if (response.status === 404) throw new Error('not-found');
      if (!response.ok) throw new Error('error');
      return response.json() as Promise<OrganizationPublic>;
    });

    const brand = fetch(`${API_BASE}/public/organizations/${encoded}/theme`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              tokens?: unknown;
              logoPosition?: unknown;
              socialNavPosition?: unknown;
            }>)
          : null,
      )
      .then((body) => ({
        tokens: safePortalTheme(body?.tokens),
        layout: {
          logoPosition: safeLogoPosition(body?.logoPosition),
          socialNavPosition: safeSocialNavPosition(body?.socialNavPosition),
        },
      }))
      .catch(() => ({ tokens: {} as PortalTheme, layout: DEFAULT_LAYOUT }));

    profile
      .then(async (data) => {
        const brandResult = await brand;
        if (!active) return;
        setView(buildPortalView(data));
        setTheme(brandResult.tokens);
        setLayout(brandResult.layout);
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

  // Real animal count for the profile stats row (pulido visual T-D02). A tiny,
  // INDEPENDENT fetch (limit 1, unfiltered) so it stays stable regardless of the
  // species filter the visitor picks inside PortalAdoptionSection — its own
  // internal fetch/filter logic is untouched.
  useEffect(() => {
    if (!slug) return;
    let active = true;
    fetchPublicAnimals({ slug, limit: 1, offset: 0 })
      .then((page) => {
        if (active) setAnimalTotal(page.total);
      })
      .catch(() => {
        // Best-effort: the stat simply stays absent (never fabricated).
      });
    return () => {
      active = false;
    };
  }, [slug]);

  // Only the safe token subset ever reaches inline styles (custom properties
  // cannot execute script; unknown keys were already filtered out).
  const themeStyle = useMemo(() => brandTokensToStyle(theme), [theme]);

  // Nivel de verificación SIEMPRE en 0 hasta que exista el catálogo (T-103) — la
  // barra de transparencia solo aporta información real cuando hay un nivel > 0
  // que mostrar (pulido visual T-D02, condición basada en el dato real, no un
  // "nunca más" hardcodeado: si el catálogo se puebla, la barra vuelve a aparecer).
  const hasVerificationSignal = (view?.profile.organization.verificationLevel?.level ?? 0) > 0;

  // Secciones agregadas AÚN sin módulo dueño (transparencia) nacen en
  // status:'placeholder' — ocultarlas evita el "Próximamente" vacío frente al
  // cliente (pulido visual T-D02). 'pets', 'products' (F-MKT-PORTAL-1),
  // 'needsToday' (F-NEEDS-PORTAL-1) y 'activeCampaign' (F-CAMPANAS-PORTAL-2,
  // S2-07) ya están cableadas a datos reales y siempre se muestran.
  const visibleSections = view?.sections.filter(
    (section) =>
      section.kind === 'pets' ||
      section.kind === 'products' ||
      section.kind === 'needsToday' ||
      section.kind === 'activeCampaign' ||
      section.status !== 'placeholder',
  );
  // "Campaña activa" se movió a la franja superior (junto a "Síguenos", pulido
  // visual); 'pets' se queda en la tab "Portafolio"; cualquier otra sección
  // que algún día deje de ser placeholder cae dentro de la tab, como antes.
  const hasActiveCampaignSection = visibleSections?.some(
    (section) => section.kind === 'activeCampaign',
  );
  const portafolioSections = visibleSections?.filter(
    (section) => section.kind !== 'activeCampaign',
  );

  // Anclas reales de la nav (header/footer, rediseño T-D04) — solo entran las
  // que de verdad tienen destino: "Nosotros"/"Contacto" únicamente con
  // contenido real, nunca un link muerto.
  const aboutUs = view?.profile.organization.aboutUs?.trim();
  const contact = view?.profile.organization.extendedContact;
  const hasContactInfo = Boolean(
    contact &&
    (contact.hours ||
      contact.fullAddress ||
      contact.mapUrl ||
      (contact.additionalPhones && contact.additionalPhones.length > 0)),
  );
  const navItems: PublicHeaderNavItem[] = [
    { label: 'Inicio', href: '#portal-top' },
    { label: 'Animales', href: '#portal-section-pets' },
    { label: 'Cómo ayudar', href: '#portal-help-cta' },
    ...(aboutUs ? [{ label: 'Nosotros', href: '#portal-about' }] : []),
    { label: 'Transparencia', href: '#portal-section-public-ledger' },
    ...(hasContactInfo ? [{ label: 'Contacto', href: '#portal-contact-info' }] : []),
  ];

  return (
    <>
      {state === 'ready' && view && (
        <PublicHeader organization={view.profile.organization} navItems={navItems} />
      )}
      <main
        id="portal-top"
        className="mx-auto w-full max-w-screen-2xl px-4 py-10 sm:px-6 lg:px-8 xl:px-12"
        style={{ ...themeStyle, scrollMarginTop: '5rem' }}
      >
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
            {hasVerificationSignal && (
              <div className="flex justify-end">
                <PortalTransparencyBar organization={view.profile.organization} />
              </div>
            )}
            {/* Header (3ra iteración): perfil + KPI(s) + acciones viven TODOS
                dentro del mismo panel (`PortalProfileSection`) — ya no hay una
                tarjeta de KPI flotante aparte ni una fila extra a su lado. */}
            <PortalProfileSection
              profile={view.profile}
              animalCount={animalTotal}
              logoPosition={layout.logoPosition}
              actions={
                <PortalHeaderActions
                  organization={view.profile.organization}
                  onBrowseCatalog={goToCatalog}
                />
              }
            />

            {/* Dos columnas (pulido visual, 2da iteración): columna principal
                con "Mascotas en adopción"/"Productos"/"Necesita hoy" SIEMPRE
                visibles (rediseño T-D04, ya no detrás de una tab), y UN panel
                lateral con "Campaña activa" + "Síguenos" juntos. El lado lo
                decide `socialNavPosition`, el mismo campo REAL ya usado
                arriba para la posición del logo/sidebar (S2-REORG,
                `PortalThemeConfig.socialNavPosition` —
                `packages/contracts/src/portals.ts`) — no uno nuevo. En mobile
                el panel lateral se apila debajo (grid de 1 columna). */}
            <div className="grid gap-6 lg:grid-cols-3" data-testid="portal-main-grid">
              <div
                className={`space-y-6 lg:col-span-2 ${layout.socialNavPosition === 'left' ? 'lg:order-last' : ''}`}
              >
                {/* "Mascotas en adopción" (kind 'pets', §M03/T-052),
                    "Productos" (kind 'products', §M10, F-MKT-PORTAL-1) y
                    "Necesita hoy" (kind 'needsToday', §M09,
                    F-NEEDS-PORTAL-1); cualquier otra sección que algún día
                    deje de ser placeholder aparecería aquí también. */}
                {portafolioSections?.map((section) =>
                  section.kind === 'pets' ? (
                    <PortalAdoptionSection
                      key={section.kind}
                      slug={slug as string}
                      organization={view.profile.organization}
                    />
                  ) : section.kind === 'products' ? (
                    <PortalProductsSection
                      key={section.kind}
                      organizationId={view.profile.organization.id}
                    />
                  ) : section.kind === 'needsToday' ? (
                    <PortalNeedsSection
                      key={section.kind}
                      organizationId={view.profile.organization.id}
                    />
                  ) : (
                    <PortalPlaceholderSection key={section.kind} section={section} />
                  ),
                )}
              </div>

              <aside
                className={`space-y-6 ${layout.socialNavPosition === 'left' ? 'lg:order-first' : ''}`}
                data-testid="portal-side-panel"
              >
                {hasActiveCampaignSection && (
                  <PortalCampaignsSection key="activeCampaign" slug={slug as string} />
                )}
                <PortalSocialLinks organization={view.profile.organization} />
              </aside>
            </div>

            <PortalHelpCta organization={view.profile.organization} />

            {/* "Nosotros"/"Información" (S2-PORTAL, rediseño T-D04): antes
                tabs, ahora secciones ancladas siempre visibles cuando hay
                contenido real — nunca una sección vacía. */}
            {aboutUs && (
              <section id="portal-about" style={{ scrollMarginTop: '5rem' }}>
                <PortalAboutSection aboutUs={aboutUs} />
              </section>
            )}
            {hasContactInfo && contact && (
              <section id="portal-contact-info" style={{ scrollMarginTop: '5rem' }}>
                <PortalContactInfoSection contact={contact} />
              </section>
            )}

            <div style={{ scrollMarginTop: '5rem' }}>
              <PortalPublicLedgerSection />
            </div>
          </div>
        )}
      </main>
      {state === 'ready' && view && (
        <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8 xl:px-12">
          <PublicFooter organization={view.profile.organization} navItems={navItems} />
        </div>
      )}
    </>
  );
}
