// Module: portals · Contracts owner: @fabian
//
// View-model del PORTAL PÚBLICO rico en `/o/:slug` (§M14). El portal se compone
// de una sección "perfil" (identidad REAL de la organización) más varias
// secciones AGREGADAS (mascotas en adopción, campaña activa, necesita hoy,
// transparencia / libro público). Hasta que existan sus módulos dueños, esas
// secciones se renderizan como placeholders estructurados con su punto de
// integración documentado.
//
// IMPORTANTE — SÓLO TIPOS: `@adoptafacil/contracts` se compila a CommonJS y un
// export de VALOR (enum/const) rompe el build de `web` (rollup no resuelve los
// re-exports CJS; ver deuda "named export CJS" / T-015 en docs/TASKS.md). Por eso
// los estados y tipos van como uniones de string, no como enums en runtime; los
// VALORES en runtime (plantilla de secciones) viven en la feature web.
import type { OrganizationPublic } from './org';

/**
 * Tipo de organización mostrado en el badge del perfil. El ENUM CANÓNICO y sus
 * valores pertenecen a @sebastian (módulo `org`); M14 sólo reserva el hueco y lo
 * consume por contrato. Se tipa laxamente como `string` hasta que `org` publique
 * su `OrganizationType`; entonces este alias apuntará a ese tipo y el perfil lo
 * heredará sin reproyectar.
 * TODO(coordinar-@sebastian): reemplazar por `OrganizationType` de `org`.
 */
export type PortalOrganizationType = string;

/** Estado de render de una sección del portal en un instante dado. */
export type PortalSectionStatus = 'loading' | 'ready' | 'empty' | 'placeholder' | 'error';

/** Secciones agregadas que componen el portal rico, además del perfil. */
export type PortalSectionKind = 'pets' | 'activeCampaign' | 'needsToday' | 'transparency';

/**
 * Una sección agregada del portal. Hoy nace en `status: 'placeholder'` con su
 * `integrationPoint` documentado; el módulo dueño la cablea (→ 'ready' / 'empty')
 * cuando exista. La sección NO transporta datos de negocio todavía: el view-model
 * es puramente estructural para que la maqueta del portal sea estable.
 */
export interface PortalSection {
  kind: PortalSectionKind;
  /** Título visible de la sección. */
  title: string;
  /** Texto de apoyo mostrado en el empty state mientras no hay datos. */
  description: string;
  /** Estado de render actual. */
  status: PortalSectionStatus;
  /**
   * Punto de integración: módulo/endpoint que alimentará la sección. Es deuda de
   * cableado (docs/TASKS.md) hasta que el módulo dueño exista.
   */
  integrationPoint: string;
}

/**
 * Perfil = identidad pública de la organización. ENVUELVE el contrato público de
 * `org` (`OrganizationPublic`) SIN reproyectarlo: si @sebastian cambia los campos
 * públicos, el perfil los hereda por contrato, sin proyección duplicada en M14.
 */
export interface PortalProfile {
  organization: OrganizationPublic;
  /**
   * Tipo de organización para el badge reservado del perfil. `undefined` mientras
   * `org` no exponga el campo en su proyección pública; el portal renderiza
   * entonces el hueco reservado en lugar de ocultar el badge.
   */
  organizationType?: PortalOrganizationType;
}

/** View-model completo del portal público rico servido en `/o/:slug`. */
export interface PortalView {
  profile: PortalProfile;
  sections: PortalSection[];
}
