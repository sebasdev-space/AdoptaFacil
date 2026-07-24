import type { ComponentType } from 'react';
import { Role } from '@adoptafacil/contracts';
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
  { path: '/campanas', label: 'Campañas', icon: MegaphoneIcon },
  { path: '/transparencia', label: 'Transparencia', icon: ShieldIcon },
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
  { path: '/organizacion', label: 'Mi organización', icon: ShieldIcon },
  // M01 · gestión documental de la org (T-031, wires T-103). RF03.
  {
    path: '/organizacion/documentos',
    label: 'Documentos',
    icon: ShieldIcon,
    roles: ORG_DOCUMENTS_ROLES,
  },
  // M14 · portal personalization by tokens (T-027). Owner/Admin gate the editing.
  { path: '/organizacion/portal', label: 'Personalización', icon: ShieldIcon },
  // M01 · revisión documental de PLATAFORMA (T-031, wires T-103). Audiencia de
  // plataforma, no de organización — separada del resto del menú.
  {
    path: '/plataforma/documentos',
    label: 'Revisión de documentos',
    icon: ShieldIcon,
    roles: PLATFORM_DOCUMENTS_ROLES,
  },
];
