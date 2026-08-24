import type { ComponentType } from 'react';
import { ORG_ROLES, Role } from '@adoptafacil/contracts';
import {
  AlertTriangleIcon,
  BoxIcon,
  ChatIcon,
  HeartIcon,
  HomeIcon,
  MegaphoneIcon,
  PawIcon,
  ShieldIcon,
  ShoppingBagIcon,
  type IconProps,
} from '../icons';

/**
 * Role sets that gate the M01/M03 surfaces wired by the shell (T-031). Each set
 * is copied VERBATIM from the `@Roles` of the backend endpoint that feeds the
 * page, so the menu entry and the route guard demand exactly what the API does:
 *   - {@link ANIMAL_VIEW_ROLES}      → GET /animals, /clinical-reminders,
 *                                       /animals/:id/clinical-events (M03).
 *   - {@link ORG_DOCUMENTS_ROLES}    → GET /org/documents (M01, RF03).
 *   - {@link PLATFORM_DOCUMENTS_ROLES} → /platform/documents review (M01, RF03),
 *                                       PLATFORM audience — never an org role.
 */
export const ANIMAL_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.ReadOnlyAuditor,
] as const;

export const ORG_DOCUMENTS_ROLES = [Role.Owner, Role.Administrator, Role.ReadOnlyAuditor] as const;

export const PLATFORM_DOCUMENTS_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/**
 * M01, S-3 — "Organizaciones duplicadas", audiencia de PLATAFORMA. Copiado
 * VERBATIM del `@Roles` de `PlatformDuplicatesController`
 * (`GET /platform/duplicates/queue`) — mismos dos roles que
 * `PLATFORM_DOCUMENTS_ROLES`, declarado aparte porque es el @Roles de un
 * endpoint DISTINTO (mismo criterio que el resto de constantes de este
 * archivo).
 */
export const PLATFORM_DUPLICATES_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/**
 * F-8 (M11, comunidad) — "Moderación de comunidad", audiencia de PLATAFORMA.
 * Copiado VERBATIM del `@Roles` de `CommunityModerationController`
 * (`GET /platform/community/posts`) — mismos dos roles que
 * `PLATFORM_DOCUMENTS_ROLES`, declarado aparte porque es el @Roles de un
 * endpoint DISTINTO (mismo criterio que el resto de constantes de este
 * archivo: se copia del controller real, no se reutiliza una constante de
 * otro dominio aunque los valores coincidan).
 */
export const COMMUNITY_MODERATION_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/**
 * M12 (S-7, RF23) — "Moderación de reseñas", audiencia de PLATAFORMA. Copiado
 * VERBATIM del `@Roles` de `PlatformReviewsController`
 * (`GET /platform/reviews/queue`) — mismos dos roles que
 * `PLATFORM_DOCUMENTS_ROLES`, declarado aparte porque es el @Roles de un
 * endpoint DISTINTO (mismo criterio que el resto de constantes de este
 * archivo).
 */
export const PLATFORM_REVIEWS_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/**
 * M13 (S-8, RF24) — "Dashboard de plataforma" (conteos de colas), audiencia
 * de PLATAFORMA. Copiado VERBATIM del `@Roles` de
 * `PlatformDashboardController.getAdminSummary` (`GET /platform/dashboard/admin`)
 * — mismos dos roles que `PLATFORM_DOCUMENTS_ROLES`, declarado aparte por el
 * mismo criterio del resto de constantes de este archivo.
 */
export const PLATFORM_ADMIN_DASHBOARD_ROLES = [
  Role.PlatformAdmin,
  Role.PlatformSuperAdmin,
] as const;

/**
 * M13 (S-8, RF24) — "Dashboard financiero" (finanzas agregadas + mapa/lista
 * geográfica), audiencia de PLATAFORMA — SOLO PlatformSuperAdmin. Copiado
 * VERBATIM del `@Roles` de `PlatformDashboardController.getSuperAdminSummary`
 * (`GET /platform/dashboard/super-admin`). Un PlatformAdmin normal NO debe
 * ver cifras financieras agregadas.
 */
export const PLATFORM_SUPER_ADMIN_DASHBOARD_ROLES = [Role.PlatformSuperAdmin] as const;

/**
 * S2-01 — reconnects "Campañas" as the INTERNAL management surface at
 * `/organizacion/campanas` (CampaignsPage), not the public portal T-065 pulled it
 * from. Copied VERBATIM from `CampaignsController`'s VIEW_ROLES (GET /campaigns):
 * Owner/Administrator/Operator manage; ReadOnlyAuditor views only (no "Coordinator"
 * role exists in this codebase, despite earlier task notes assuming one).
 */
export const CAMPAIGNS_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.ReadOnlyAuditor,
] as const;

/**
 * S2-03 — gestión interna de apadrinamientos recibidos en
 * `/organizacion/apadrinamientos` (SponsorshipsPage). Copiado VERBATIM de
 * `SponsorshipsController`'s `VIEW_ROLES` (`GET /sponsorships`): a diferencia
 * de {@link CAMPAIGNS_VIEW_ROLES}, aquí NO hay Operator — solo
 * Owner/Administrator gestionan y ven, + ReadOnlyAuditor solo ve. Hallazgo
 * documentado en el reporte de cierre de S2-03 (el spec original asumía
 * Operator también).
 */
export const SPONSORSHIP_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.ReadOnlyAuditor,
] as const;

/**
 * S-6 (M08, RF18/RF19) — gestión interna de voluntariado en
 * `/organizacion/voluntariado` (VolunteerOpportunitiesPage). Copiado VERBATIM
 * de `VolunteerOpportunitiesController`'s `VIEW_ROLES` — sin Operator (su
 * alcance no está definido por el documento base para este módulo, mismo
 * criterio que Apadrinamientos), + ReadOnlyAuditor solo ve.
 */
export const VOLUNTEERING_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.ReadOnlyAuditor,
] as const;

/**
 * F-NAV-ADOPCIONES (AUD-F1 finding): "Adopciones" had NO role gate at all —
 * any authenticated user, including a Persona with no org, saw the entry and
 * landed on the org's evaluation kanban (empty, meaningless to them). Copied
 * VERBATIM from `AdoptionsController`'s `EVAL_ROLES` (`GET /adoptions`,
 * `adoptions.controller.ts:18`) — Owner/Administrator/Operator only, no
 * ReadOnlyAuditor (unlike CAMPAIGNS_VIEW_ROLES, the backend here is
 * write-side evaluation, not a view-only audience).
 *
 * Containment only: this hides the entry from a Persona. The Persona-facing
 * "mis solicitudes" view is F1-01, blocked on a backend endpoint that doesn't
 * exist yet — out of scope here.
 */
export const ADOPTIONS_MANAGEMENT_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * F-DONACIONES-RECIBIDAS: "Donaciones recibidas" (gestión de org, la contraparte
 * de "Mis donaciones" del donante). Copiado VERBATIM de `MANAGE_ROLES` en
 * `donations.controller.ts` (`GET /donations/received`) — mismo trío que
 * `ADOPTIONS_MANAGEMENT_ROLES` (Owner/Administrador/Operador), sin
 * ReadOnlyAuditor (el backend no lo incluye para esta ruta).
 */
export const DONATIONS_MANAGEMENT_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * F-6 (M09, banco de recursos) — "Necesidades recibidas" (gestión de org).
 * Copiado VERBATIM de `RESOURCE_VIEW_ROLES` en `resource-needs.controller.ts`
 * (`GET /resources/needs`): Owner/Administrator/Operator gestionan;
 * ReadOnlyAuditor solo ve — mismo trío que `CAMPAIGNS_VIEW_ROLES`.
 */
export const RESOURCE_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.ReadOnlyAuditor,
] as const;

/**
 * F-7 (M10, marketplace simplificado) — "Marketplace" (gestión de org).
 * Copiado VERBATIM de `MARKETPLACE_VIEW_ROLES` en
 * `marketplace-products.controller.ts` (`GET /marketplace/products`):
 * Owner/Administrator/Operator gestionan; ReadOnlyAuditor solo ve — mismo
 * trío que `CAMPAIGNS_VIEW_ROLES`/`RESOURCE_VIEW_ROLES`.
 */
export const MARKETPLACE_VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.ReadOnlyAuditor,
] as const;

/**
 * "Mi organización" / "Personalización" / "Transparencia" (T-062, fix §13 UX
 * gap): these back onto GET endpoints with NO `@Roles` decorator at all (only
 * `@UseGuards(JwtAuthGuard)` — e.g. `GET /org/profile`, `GET /portals/theme`,
 * `GET /org/formalization`), because the backend scopes them by TENANT (RLS),
 * not by role — "any authenticated member" there really means "no additional
 * backend restriction beyond auth". A Persona has no row in `ORG_ROLES` at all
 * (they only have their own personal tenant), so gating the NAV/ROUTE with the
 * canonical `ORG_ROLES` (§13, `@adoptafacil/contracts`) is what actually
 * excludes a Persona while still admitting every real org role — Owner/
 * Administrator/Operator/Volunteer/TemporaryCollaborator/Veterinarian/
 * ReadOnlyAuditor. Narrower write actions (e.g. editing the theme) stay
 * Owner/Administrator-only, enforced separately by the backend PUT and by
 * PortalThemePage itself — this gate is about VIEW/ENTRY, not editing.
 */
export const ORG_MEMBER_ROLES = ORG_ROLES;

/**
 * Primary portal sections shown in the sidebar (§M14 portales).
 *
 * This is the single source of truth for the navigation: the sidebar renders it
 * and the router (see router/routes.tsx) maps each `path` to a page. A section
 * whose real screen doesn't exist yet is simply NOT listed here (T-065,
 * pre-demo) rather than pointing at a placeholder — module owners add the
 * entry once the real route exists.
 */
export interface NavItem {
  /** Route path; also the NavLink target. */
  path: string;
  /** Visible label (es-CO). */
  label: string;
  /** Decorative section icon. */
  icon: ComponentType<IconProps>;
  /** Match the path exactly (used for the index route "/"). */
  end?: boolean;
  /**
   * Roles that may see this entry (deny-by-default). Omitted → visible to every
   * authenticated user. When present, the sidebar hides the entry unless the
   * session `hasAnyRole(...roles)` — the FIRST barrier of the double-barrier UX;
   * the route's <RequireRoles> is the second.
   */
  roles?: readonly Role[];
  /**
   * F1-01: restricts the entry to a Persona account (`session.user.accountType
   * === 'person'`), the INVERSE of `roles` — an org account has at least one
   * `ORG_ROLES` entry and a Persona has none, so `roles` (an allow-list of "has
   * ANY of these") can't express "has none of these." Needed because the
   * backend for this entry's route has no role gate at all (any authenticated
   * user), unlike every other `personaOnly` candidate scenario — "Donaciones"
   * stays ungated for both account kinds on purpose (an org's own donation
   * history is legitimately empty, not hidden); "Mis solicitudes" must not
   * show an org account someone else's UX at all.
   */
  personaOnly?: boolean;
  /**
   * Fase 12 (REFACTOR-VISUAL v2): marks an entry whose screen is a
   * `ComingSoon` placeholder (no backend yet) — the sidebar shows a "Pronto"
   * badge next to the label instead of hiding the entry outright.
   */
  comingSoon?: boolean;
  /**
   * MENU-SUBMENUS: when present, this entry renders as a collapsible group —
   * `children` are the real, independently-gated leaves (each keeps its own
   * `roles`/`personaOnly`/`comingSoon`, filtered exactly like a top-level
   * `NavItem` always was). Grouping is PURELY visual: a child's visibility
   * and destination are unchanged from before this entry existed as a group.
   */
  children?: NavItem[];
  /**
   * MENU-SUBMENUS: only meaningful on a group (`children` present). `true`
   * ("Documentos") means the label itself is a real link to `path`, with a
   * separate chevron control just for expand/collapse — clicking the chevron
   * never navigates, clicking the label never toggles. Omitted/`false`
   * ("Donaciones", "Apadrinamientos") means the whole row is a pure
   * expand/collapse toggle and `path` is only a stable React key, never a
   * link target (the parent has no page of its own to go to).
   */
  navigable?: boolean;
}

export const navItems: NavItem[] = [
  // F-LANDING-01: "/" is now the PUBLIC general portal, outside the shell — the
  // authenticated home moved to /inicio (see shell/router/routes.tsx).
  { path: '/inicio', label: 'Inicio', icon: HomeIcon, end: true },
  {
    path: '/adopciones',
    label: 'Adopciones',
    icon: PawIcon,
    roles: ADOPTIONS_MANAGEMENT_ROLES,
  },
  // F1-01: entrada SEPARADA del kanban de organización de arriba — "Adopciones"
  // es para quien evalúa (Owner/Administrador/Operador); "Mis solicitudes" es
  // para la Persona que postuló. GET /adoptions/mine no tiene gate de rol
  // (cualquier autenticado), así que el filtro real es `personaOnly` — ver su
  // doc en NavItem para por qué no puede expresarse con `roles`.
  { path: '/mis-solicitudes', label: 'Mis solicitudes', icon: PawIcon, personaOnly: true },
  // MENU-SUBMENUS: "Donaciones" agrupa las dos entradas planas que existían
  // (mismas rutas, mismos roles de siempre) — el padre solo expande/colapsa,
  // nunca navega (no tiene página propia).
  {
    path: '/donaciones',
    label: 'Donaciones',
    icon: HeartIcon,
    children: [
      // Antes era el propio ítem "Donaciones" — cualquier autenticado, sin
      // @Roles en el backend. Se renombra a "Mis donaciones" solo para
      // distinguirla de "Donaciones recibidas" dentro del grupo.
      { path: '/donaciones', label: 'Mis donaciones', icon: HeartIcon },
      // F-DONACIONES-RECIBIDAS: la contraparte de gestión de org (GET
      // /donations/received, MANAGE_ROLES) — idéntica a como estaba.
      {
        path: '/donaciones-recibidas',
        label: 'Donaciones recibidas',
        icon: HeartIcon,
        roles: DONATIONS_MANAGEMENT_ROLES,
      },
    ],
  },
  // S2-01: "Campañas" RESTORED — T-065 removed it because the link pointed at
  // the PUBLIC portal route and exited the shell; the in-shell management
  // screen (/organizacion/campanas) now exists, so the entry points there
  // instead, gated to CAMPAIGNS_VIEW_ROLES (never Persona/PlatformAdmin). The
  // public route (/campanas) is unchanged — a donor still reaches it from the
  // org's public portal (/o/:slug), never from this menu.
  {
    path: '/organizacion/campanas',
    label: 'Campañas',
    icon: MegaphoneIcon,
    roles: CAMPAIGNS_VIEW_ROLES,
  },
  // MENU-SUBMENUS: "Apadrinamientos" agrupa "Mis apadrinamientos" (donante,
  // sin @Roles) y la gestión de la org ("Apadrinamientos recibidos", antes
  // el ítem plano "Apadrinamientos", SPONSORSHIP_VIEW_ROLES) — mismas rutas y
  // roles de siempre; el padre solo expande/colapsa.
  {
    path: '/apadrinar',
    label: 'Apadrinamientos',
    icon: HeartIcon,
    children: [
      // M07 · "mis apadrinamientos" (S2-03, RF17) — apadrinar/ver el propio
      // historial, sin @Roles en el backend, igual que Donaciones: visible a
      // cualquier usuario autenticado.
      { path: '/apadrinar', label: 'Mis apadrinamientos', icon: HeartIcon },
      // M07 · apadrinamientos RECIBIDOS por la organización (S2-03, RF17).
      // Gated a SPONSORSHIP_VIEW_ROLES — calcado VERBATIM de
      // `SponsorshipsController`'s VIEW_ROLES (sin Operator, a diferencia de
      // Campañas; ver comentario histórico en esa constante).
      {
        path: '/organizacion/apadrinamientos',
        label: 'Apadrinamientos recibidos',
        icon: HeartIcon,
        roles: SPONSORSHIP_VIEW_ROLES,
      },
    ],
  },
  // MENU-SUBMENUS: "Banco de recursos" agrupa "Mis ofertas" (donante, sin
  // @Roles — cualquier autenticado, igual que "Mis donaciones") y la gestión
  // de la org ("Necesidades recibidas", RESOURCE_VIEW_ROLES) — mismo patrón
  // que el grupo "Donaciones" (F-6, M09).
  {
    path: '/mis-ofertas',
    label: 'Banco de recursos',
    icon: BoxIcon,
    children: [
      { path: '/mis-ofertas', label: 'Mis ofertas', icon: BoxIcon },
      {
        path: '/organizacion/recursos',
        label: 'Necesidades recibidas',
        icon: BoxIcon,
        roles: RESOURCE_VIEW_ROLES,
      },
    ],
  },
  // MENU-SUBMENUS: "Comunidad" agrupa el feed cruzado ("Comunidad", sin
  // @Roles — cualquier autenticado, igual que "Mis donaciones"/"Mis
  // ofertas") y "Mis publicaciones" (idem, sin @Roles) — mismo patrón que
  // los grupos "Donaciones"/"Banco de recursos" (F-8, M11).
  {
    path: '/comunidad',
    label: 'Comunidad',
    icon: ChatIcon,
    children: [
      { path: '/comunidad', label: 'Feed', icon: ChatIcon },
      { path: '/mis-publicaciones', label: 'Mis publicaciones', icon: ChatIcon },
    ],
  },
  // F-7 (M10, marketplace simplificado): catálogo de productos de la
  // organización, contacto por WhatsApp — mismo patrón plano que "Campañas"
  // arriba, gated a MARKETPLACE_VIEW_ROLES (calcado del @Roles real).
  {
    path: '/organizacion/marketplace',
    label: 'Marketplace',
    icon: ShoppingBagIcon,
    roles: MARKETPLACE_VIEW_ROLES,
  },
  // T-065: "Transparencia" REMOVED from the menu entirely — the screen was only
  // ever a placeholder ("se implementará en la Ola 1..."); the REAL transparency
  // indicator (Nivel/%/Rendición) already lives in the persistent header bar on
  // every page (shell/transparency), so nothing is actually lost. The `/transparencia`
  // ROUTE stays registered (routes.tsx) but now redirects home instead of showing
  // the stale placeholder text — reversible post-30 once a real screen exists.
  // M03 · animales + recordatorios clínicos (T-031, wires T-104/T-106). Reuses
  // PawIcon; a dedicated "bell" for reminders is a reported gap in shell/icons.
  { path: '/animales', label: 'Animales', icon: PawIcon, roles: ANIMAL_VIEW_ROLES },
  {
    path: '/recordatorios',
    label: 'Recordatorios',
    icon: AlertTriangleIcon,
    roles: ANIMAL_VIEW_ROLES,
  },
  // MENU-SUBMENUS: el ítem plano "Mi organización" (T-062, ORG_MEMBER_ROLES)
  // se retiró de esta lista — el bloque del nombre de la org en la cabecera
  // del sidebar (SidebarIdentity) ahora navega a esa misma ruta `/organizacion`
  // (ver sidebar.tsx). Ningún rol ni ruta cambia, solo el punto de entrada.
  //
  // "Documentos" es un grupo NAVEGABLE: el texto navega al módulo real
  // (/organizacion/documentos, ORG_DOCUMENTS_ROLES — sin cambios) y un chevron
  // aparte despliega los dos placeholders "Pronto". OJO: ORG_DOCUMENTS_ROLES
  // (Owner/Administrator/ReadOnlyAuditor) es MÁS ANGOSTO que ORG_MEMBER_ROLES
  // (todos los roles de org) — Operator/Volunteer/TemporaryCollaborator/
  // Veterinarian pueden ver los hijos "Pronto" sin poder ver ni navegar el
  // padre. Para no cambiarle el alcance a nadie (criterio "mismos permisos de
  // siempre"), el sidebar renderiza el grupo si CUALQUIERA de padre/hijos es
  // visible, y solo activa el link del padre cuando su propio rol lo permite
  // (ver sidebar.tsx) — así ningún rol pierde ni gana acceso a nada.
  {
    path: '/organizacion/documentos',
    label: 'Documentos',
    icon: ShieldIcon,
    roles: ORG_DOCUMENTS_ROLES,
    navigable: true,
    children: [
      {
        path: '/organizacion/transparencia-nacional',
        label: 'Transparencia nacional',
        icon: ShieldIcon,
        roles: ORG_MEMBER_ROLES,
        comingSoon: true,
      },
      {
        path: '/organizacion/reporte-exogeno',
        label: 'Reporte exógeno 2575',
        icon: ShieldIcon,
        roles: ORG_MEMBER_ROLES,
        comingSoon: true,
      },
    ],
  },
  // M14 · portal personalization by tokens (T-027) — REMOVED from the sidebar
  // (S2-04A §4): it now lives as a button inside "Mi organización"'s action bar
  // (OrgProfilePage, S2-01/S2-REORG), not as a top-level nav entry. The ROUTE
  // (`/organizacion/portal`) and its guard are UNCHANGED — see routes.tsx.
  // M08 (S-6, RF18/RF19): this was a Fase-12 "Coming Soon" placeholder
  // (backend didn't exist yet) — now that the module is built, the entry
  // becomes real: `comingSoon` is dropped and `roles` is tightened from the
  // generic `ORG_MEMBER_ROLES` placeholder to the real
  // `VOLUNTEERING_VIEW_ROLES` (copied VERBATIM from the controller). Same
  // path/label/icon — this UPDATES the existing entry, not a new one.
  {
    path: '/organizacion/voluntariado',
    label: 'Voluntariado',
    icon: HeartIcon,
    roles: VOLUNTEERING_VIEW_ROLES,
  },
  // M01 · revisión documental de PLATAFORMA (T-031, wires T-103). Audiencia de
  // plataforma, no de organización — separada del resto del menú.
  {
    path: '/plataforma/documentos',
    label: 'Revisión de documentos',
    icon: ShieldIcon,
    roles: PLATFORM_DOCUMENTS_ROLES,
  },
  // M01, S-3 · organizaciones posiblemente duplicadas (mitigación de riesgo
  // "Captación ilegal / LA-FT", §16). Audiencia de PLATAFORMA — ruta hermana
  // de la revisión de documentos, misma zona.
  {
    path: '/plataforma/organizaciones-duplicadas',
    label: 'Organizaciones duplicadas',
    icon: AlertTriangleIcon,
    roles: PLATFORM_DUPLICATES_ROLES,
  },
  // M11 · moderación básica de la comunidad, audiencia de PLATAFORMA (F-8).
  {
    path: '/plataforma/comunidad',
    label: 'Moderación de comunidad',
    icon: ChatIcon,
    roles: COMMUNITY_MODERATION_ROLES,
  },
  // M08 (S-6, RF18/RF19) · "Mi voluntariado" — explorar oportunidades,
  // inscribirse, registrar horas y descargar certificados. Sin @Roles en el
  // backend (cualquier Persona autenticada), mismo criterio que
  // "Mis solicitudes" (adopciones) y "Mis apadrinamientos".
  {
    path: '/voluntariado',
    label: 'Mi voluntariado',
    icon: HeartIcon,
  },
  // M12 (S-7, RF23) · moderación de reseñas, audiencia de PLATAFORMA — ruta
  // hermana de /plataforma/documentos y /plataforma/organizaciones-duplicadas.
  {
    path: '/plataforma/resenas',
    label: 'Moderación de reseñas',
    icon: ChatIcon,
    roles: PLATFORM_REVIEWS_ROLES,
  },
  // M12 (S-7, RF23) · "Mis reseñas" — lo que la Persona ha reseñado y su
  // estado. Sin @Roles en el backend (cualquier Persona autenticada), mismo
  // criterio que "Mi voluntariado"/"Mis apadrinamientos".
  {
    path: '/resenas',
    label: 'Mis reseñas',
    icon: ChatIcon,
  },
  // M13 (S-8, RF24) · dashboards por audiencia de PLATAFORMA — conteos
  // consolidados de las tres colas ya existentes (documentos, duplicidad,
  // reseñas). Ruta hermana de las otras vistas /plataforma/*.
  {
    path: '/plataforma/dashboard',
    label: 'Dashboard de plataforma',
    icon: ShieldIcon,
    roles: PLATFORM_ADMIN_DASHBOARD_ROLES,
  },
  // M13 (S-8, RF24) · dashboard financiero — SOLO PlatformSuperAdmin, nunca
  // un PlatformAdmin normal (RBAC deny-by-default sobre cifras financieras).
  {
    path: '/plataforma/dashboard/financiero',
    label: 'Dashboard financiero',
    icon: ShieldIcon,
    roles: PLATFORM_SUPER_ADMIN_DASHBOARD_ROLES,
  },
];
