import type { ComponentType } from 'react';
import { HeartIcon, HomeIcon, MegaphoneIcon, PawIcon, ShieldIcon, type IconProps } from '../icons';

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
}

export const navItems: NavItem[] = [
  { path: '/', label: 'Inicio', icon: HomeIcon, end: true },
  { path: '/adopciones', label: 'Adopciones', icon: PawIcon },
  { path: '/donaciones', label: 'Donaciones', icon: HeartIcon },
  { path: '/campanas', label: 'Campañas', icon: MegaphoneIcon },
  { path: '/transparencia', label: 'Transparencia', icon: ShieldIcon },
  // M01 · organization profile (my line, appended). Reuses ShieldIcon — a
  // dedicated "organization/building" icon is a reported gap in shell/icons.
  { path: '/organizacion', label: 'Mi organización', icon: ShieldIcon },
];
