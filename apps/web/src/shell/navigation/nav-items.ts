import type { ComponentType } from 'react';
import { ORG_ROLES, Role } from '@adoptafacil/contracts';
import {
  AlertTriangleIcon,
  HeartIcon,
  HomeIcon,
  MegaphoneIcon,
  PawIcon,
  ShieldIcon,
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
 * and the router (see router/routes.tsx) maps each `path` to a page. Module
 * owners replace the placeholder pages in Ola 1 without touching this list.
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
}

export const navItems: NavItem[] = [
  { path: '/', label: 'Inicio', icon: HomeIcon, end: true },
  { path: '/adopciones', label: 'Adopciones', icon: PawIcon },
  { path: '/donaciones', label: 'Donaciones', icon: HeartIcon },
  // '/campanas' is the PUBLIC campaigns portal (T-055, outside RequireAuth) —
  // relevant to a donor too, so it stays open to every authenticated role.
  { path: '/campanas', label: 'Campañas', icon: MegaphoneIcon },
  // Org-facing dashboard (formalización + rendición del portal, T-062 fix).
  { path: '/transparencia', label: 'Transparencia', icon: ShieldIcon, roles: ORG_MEMBER_ROLES },
  // M03 · animales + recordatorios clínicos (T-031, wires T-104/T-106). Reuses
  // PawIcon; a dedicated "bell" for reminders is a reported gap in shell/icons.
  { path: '/animales', label: 'Animales', icon: PawIcon, roles: ANIMAL_VIEW_ROLES },
  {
    path: '/recordatorios',
    label: 'Recordatorios',
    icon: AlertTriangleIcon,
    roles: ANIMAL_VIEW_ROLES,
  },
  // M01 · organization profile (my line, appended). Reuses ShieldIcon — a
  // dedicated "organization/building" icon is a reported gap in shell/icons.
  // T-062: gated to ORG_MEMBER_ROLES — a Persona has no organization to manage.
  { path: '/organizacion', label: 'Mi organización', icon: ShieldIcon, roles: ORG_MEMBER_ROLES },
  // M01 · gestión documental de la org (T-031, wires T-103). RF03.
  {
    path: '/organizacion/documentos',
    label: 'Documentos',
    icon: ShieldIcon,
    roles: ORG_DOCUMENTS_ROLES,
  },
  // M14 · portal personalization by tokens (T-027). Owner/Admin gate the EDIT
  // action (backend PUT + PortalThemePage itself); T-062 gates VIEW/ENTRY here
  // to ORG_MEMBER_ROLES, matching GET /portals/theme (any authenticated member).
  {
    path: '/organizacion/portal',
    label: 'Personalización',
    icon: ShieldIcon,
    roles: ORG_MEMBER_ROLES,
  },
  // M01 · revisión documental de PLATAFORMA (T-031, wires T-103). Audiencia de
  // plataforma, no de organización — separada del resto del menú.
  {
    path: '/plataforma/documentos',
    label: 'Revisión de documentos',
    icon: ShieldIcon,
    roles: PLATFORM_DOCUMENTS_ROLES,
  },
];
