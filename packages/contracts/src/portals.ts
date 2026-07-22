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

// ============================================================================
// M14 — PERSONALIZACIÓN POR TOKENS (T-027)
//
// Cada organización personaliza su portal SÓLO mediante un subconjunto SEGURO de
// tokens de marca (NO CSS/HTML arbitrario): así se evita la inyección. El backend
// valida formato y contraste antes de persistir; el portal público los aplica en
// runtime (vía `brandTokensToStyle`/`applyBrandTokens` del design system, T-020).
//
// SÓLO TIPOS (ver nota CJS arriba): la LISTA de tokens editables y las expresiones
// de validación son VALORES y viven en el backend (`apps/api/.../portals`) y en la
// feature web; aquí sólo se declara la forma del contrato.
// ============================================================================

/**
 * Tokens de COLOR que una organización puede personalizar (subconjunto seguro de
 * los tokens del design system). Cada valor es un canal HSL "crudo" `"H S% L%"`
 * (p. ej. `"142 72% 29%"`), idéntico al formato que consume `@adoptafacil/ui`.
 * Se excluyen a propósito tokens de tipografía/estructura (fuentes, offsets),
 * que abren superficie de inyección o rompen la maqueta.
 */
export type PortalColorToken =
  | 'primary'
  | 'primary-foreground'
  | 'secondary'
  | 'secondary-foreground'
  | 'accent'
  | 'accent-foreground'
  | 'ring';

/**
 * Tokens ESCALARES personalizables. Sólo `radius` (una longitud CSS acotada); no
 * se exponen fuentes ni offsets para no permitir valores arbitrarios peligrosos.
 */
export type PortalScalarToken = 'radius';

/** Unión de todos los tokens que la organización puede sobrescribir. */
export type PortalThemeToken = PortalColorToken | PortalScalarToken;

/**
 * Tema de marca de una organización: mapa PARCIAL de token → valor. Sólo se
 * almacenan/aplican tokens del subconjunto seguro y ya VALIDADOS (formato +
 * contraste). Un tema vacío significa "usar el tema por defecto del design system".
 */
export type PortalTheme = Partial<Record<PortalThemeToken, string>>;

/** Respuesta de lectura del tema (propio o público). */
export interface PortalThemeConfig {
  tokens: PortalTheme;
}

/** Entrada para crear/actualizar el tema (Owner/Admin). */
export interface UpdatePortalThemeInput {
  tokens: PortalTheme;
}

// ----------------------------------------------------------------------------
// Indicador de transparencia con datos reales (§M14)
//
// "Nivel · % formalización · rendición". Consume el contrato de `org`:
//   - nivel            ← VerificationLevel.level
//   - % formalización  ← DERIVADO de la posición del estado en
//                        FORMALIZATION_SEQUENCE (índice/total). Es DECISIÓN del
//                        documento base, REVISABLE: no es una métrica nueva.
//   - rendición        ← PLACEHOLDER tipado hasta que existan campañas/donaciones
//                        (M05/M06). NO se calcula con datos inventados.
// ----------------------------------------------------------------------------

/**
 * Estado de la rendición de cuentas. `'no-disponible'` es el PLACEHOLDER honesto
 * de hoy: aún no hay fuente de datos, así que no se afirma ni al-día ni atrasada.
 * Los otros valores quedan reservados para cuando M05/M06 alimenten el dato.
 */
export type PortalAccountabilityStatus = 'al-dia' | 'pendiente' | 'atrasada' | 'no-disponible';

/**
 * Rendición de cuentas — PLACEHOLDER tipado. Hoy `status: 'no-disponible'`; el
 * `integrationPoint` documenta el módulo/endpoint que la alimentará. NO se calcula
 * con datos inventados: es el punto de integración listo para M05/M06.
 */
export interface PortalAccountability {
  status: PortalAccountabilityStatus;
  /** Módulo/endpoint que alimentará la rendición cuando exista. */
  integrationPoint: string;
}

/**
 * Datos del indicador de transparencia (§M14). `level` y `formalizationPct` son
 * REALES (derivados del contrato de `org`); `accountability` es un placeholder
 * tipado hasta M05/M06.
 */
export interface PortalTransparency {
  /** Nivel de verificación (contrato `org.VerificationLevel.level`). */
  level: number;
  /**
   * % de formalización DERIVADO de la posición del estado en
   * FORMALIZATION_SEQUENCE (0–100). Decisión del documento base — revisable.
   */
  formalizationPct: number;
  accountability: PortalAccountability;
}
