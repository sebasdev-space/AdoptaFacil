import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type {
  OrganizationPublic,
  PortalLogoPosition,
  PortalSocialNavPosition,
  PortalTheme,
  PortalView,
} from '@adoptafacil/contracts';
import { EmptyState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@adoptafacil/ui';
import { brandTokensToStyle } from '../../../shell/theme';
import { buildPortalView } from '../model/portal-view';
import { safeLogoPosition, safePortalTheme, safeSocialNavPosition } from '../model/theme';
import { fetchPublicAnimals } from '../api/public-animals';
import { PortalProfileSection } from '../components/portal-profile-section';
import { PortalPlaceholderSection } from '../components/portal-placeholder-section';
import { PortalTransparencyBar } from '../components/portal-transparency-bar';
import { PortalSocialLinks } from '../components/portal-social-links';
import { PortalAdoptionSection } from '../components/portal-adoption-section';
import { PortalCampaignsSection } from '../components/portal-campaigns-section';
import { PortalAboutSection } from '../components/portal-about-section';
import { PortalContactInfoSection } from '../components/portal-contact-info-section';
import { PortalHeaderActions } from '../components/portal-header-actions';
import { PortalPublicLedgerSection } from '../components/portal-public-ledger-section';

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
 * The portal is a rich, multi-section page (pulido visual T-D02):
 *  - hero + "perfil" — cover/logo, name, type/formalization badges and a real
 *    stats row (location, adoptable animal count, formalization), read straight
 *    from the `OrganizationPublic` contract (inherits any public-field change).
 *  - the transparency indicator (§M14, T-027) only mounts when it has a REAL
 *    signal to show (verificationLevel > 0) — otherwise it stays unmounted rather
 *    than displaying an always-"No disponible" bar.
 *  - pulido visual (imagen de referencia usada solo como guía, 2 iteraciones):
 *    KPIs reales arriba (`PortalKpis`); acciones principales
 *    (Donar/Adoptar/Apadrinar, `PortalHeaderActions`) junto al nombre/badges
 *    dentro de `PortalProfileSection` (no como barra suelta); y un layout de
 *    dos columnas debajo — columna principal con las tabs
 *    Portafolio/Nosotros/Información, y UN panel lateral con "Campaña
 *    activa" + "Síguenos" juntos, del lado que indique `socialNavPosition`
 *    (S2-REORG, mismo campo real ya usado para el logo/sidebar). En mobile
 *    el panel lateral se apila debajo. Todo con los MISMOS
 *    componentes/rutas de siempre, solo reubicados.
 *  - aggregated sections still in `status: 'placeholder'` (necesita hoy /
 *    transparencia — no owning module yet) are simply NOT mounted, instead of
 *    showing an empty "Próximamente" card; 'pets' and 'activeCampaign'
 *    (F-CAMPANAS-PORTAL-2, S2-07) are wired to real data
 *    (see docs/TASKS.md · deuda de cableado M14).
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
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [state, setState] = useState<LoadState>('loading');
  const [animalTotal, setAnimalTotal] = useState<number | undefined>(undefined);
  const [activeTab, setActiveTab] = useState('portafolio');
  const tabsRef = useRef<HTMLDivElement>(null);

  // "Adoptar"/"Apadrinar" (pulido visual) no inventan un flujo nuevo: solo
  // llevan al catálogo real (tab "Portafolio") donde el visitante elige el
  // animal y sigue la ruta que ya existe (ver `PortalHeaderActions`).
  const goToCatalog = () => {
    setActiveTab('portafolio');
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // Secciones agregadas AÚN sin módulo dueño (necesita hoy/transparencia) nacen en
  // status:'placeholder' — ocultarlas evita el "Próximamente" vacío frente al
  // cliente (pulido visual T-D02). 'pets' y 'activeCampaign' (F-CAMPANAS-PORTAL-2,
  // S2-07) ya están cableadas a datos reales y siempre se muestran.
  const visibleSections = view?.sections.filter(
    (section) =>
      section.kind === 'pets' ||
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

  // Tabs "Nosotros"/"Información" (S2-PORTAL) solo existen cuando hay contenido
  // REAL que mostrar — nunca una tab vacía. "Portafolio" siempre está (§5.1).
  const aboutUs = view?.profile.organization.aboutUs?.trim();
  const contact = view?.profile.organization.extendedContact;
  const hasContactInfo = Boolean(
    contact &&
    (contact.hours ||
      contact.fullAddress ||
      contact.mapUrl ||
      (contact.additionalPhones && contact.additionalPhones.length > 0)),
  );

  return (
    <main
      className="mx-auto w-full max-w-screen-2xl px-4 py-10 sm:px-6 lg:px-8 xl:px-12"
      style={themeStyle}
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
              con las tabs Portafolio/Nosotros/Información, y UN panel
              lateral con "Campaña activa" + "Síguenos" juntos (antes cada
              uno suelto). El lado lo decide `socialNavPosition`, el mismo
              campo REAL ya usado arriba para la posición del logo/sidebar
              (S2-REORG, `PortalThemeConfig.socialNavPosition` —
              `packages/contracts/src/portals.ts`) — no uno nuevo. En mobile
              el panel lateral se apila debajo (grid de 1 columna). */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div
              ref={tabsRef}
              className={`lg:col-span-2 ${layout.socialNavPosition === 'left' ? 'lg:order-last' : ''}`}
            >
              {/* Menú de tabs (S2-PORTAL, §5.1): "Portafolio" siempre
                  presente; "Nosotros"/"Información" solo cuando hay
                  contenido real. */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="portafolio">Portafolio</TabsTrigger>
                  {aboutUs && <TabsTrigger value="nosotros">Nosotros</TabsTrigger>}
                  {hasContactInfo && <TabsTrigger value="informacion">Información</TabsTrigger>}
                </TabsList>

                <TabsContent value="portafolio">
                  <div className="space-y-6">
                    {/* "Mascotas en adopción" (kind 'pets', §M03/T-052);
                        cualquier otra sección que algún día deje de ser
                        placeholder aparecería aquí también. */}
                    {portafolioSections?.map((section) =>
                      section.kind === 'pets' ? (
                        <PortalAdoptionSection key={section.kind} slug={slug as string} />
                      ) : (
                        <PortalPlaceholderSection key={section.kind} section={section} />
                      ),
                    )}
                  </div>
                </TabsContent>

                {aboutUs && (
                  <TabsContent value="nosotros">
                    <PortalAboutSection aboutUs={aboutUs} />
                  </TabsContent>
                )}

                {hasContactInfo && contact && (
                  <TabsContent value="informacion">
                    <PortalContactInfoSection contact={contact} />
                  </TabsContent>
                )}
              </Tabs>
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

          <PortalPublicLedgerSection />
        </div>
      )}
    </main>
  );
}
