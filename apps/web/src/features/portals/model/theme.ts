import type {
  PortalLogoPosition,
  PortalSocialNavPosition,
  PortalTheme,
  PortalThemeToken,
} from '@adoptafacil/contracts';

/**
 * M14 personalización por tokens (T-027) — metadatos de la UI de configuración y
 * saneo defensivo del tema en el cliente.
 *
 * La AUTORIDAD de validación (formato + contraste + claves permitidas) es el
 * backend (deny-by-default, `apps/api/.../portals.schemas.ts`). Aquí sólo vive lo
 * que la web necesita: la lista de campos editables del formulario y un filtro
 * que descarta claves desconocidas antes de aplicar un tema (p. ej. una respuesta
 * pública inesperada), para no inyectar nunca propiedades no previstas.
 *
 * Es un VALOR en runtime, por eso vive en la feature y no en `@adoptafacil/contracts`
 * (contracts se mantiene sólo-tipos; ver nota en `contracts/src/portals.ts`).
 */

export interface PortalThemeField {
  token: PortalThemeToken;
  /** Etiqueta visible (es-CO). */
  label: string;
  /** Texto de ayuda: dónde se ve de verdad este color en el portal real
   *  (T-PERSONALIZACION-AUDIT) — nunca una promesa genérica de "acento del
   *  portal" que no corresponda a dónde el token realmente pinta algo. */
  hint: string;
}

/**
 * Campos editables del tema, en orden de presentación. Fuente única de la UI.
 *
 * SOLO los 5 tokens que de verdad pintan algo en el portal público real
 * (T-PERSONALIZACION-AUDIT, auditoría contra `public-portal.module.scss` /
 * `public-catalog.module.scss` / `public-reviews.module.scss` y los
 * `.module.scss` de `packages/ui`). `secondary`/`secondary-foreground` y
 * `radius` se QUITARON: no tienen un solo consumidor real (ver el comentario
 * en `packages/contracts/src/portals.ts`).
 */
export const PORTAL_THEME_FIELDS: readonly PortalThemeField[] = [
  // Labels en español simple (S2-REORG) — un dueño no técnico nunca necesita
  // ver "token"/"HSL": el color lo elige con el selector nativo, el hint (con
  // el formato crudo) solo aparece en un tooltip al pasar el mouse.
  // primary/primary-foreground son el color "principal" del portal entero (botones,
  // badges, highlights) — sin caveat de alcance porque sí cubren casi todo.
  { token: 'primary', label: 'Color principal', hint: '' },
  { token: 'primary-foreground', label: 'Texto sobre el principal', hint: '' },
  {
    token: 'accent',
    label: 'Color de acento',
    hint: 'Se ve en la insignia "Nuevo" de las tarjetas del catálogo de animales.',
  },
  {
    token: 'accent-foreground',
    label: 'Texto sobre acento',
    hint: 'Texto de esa misma insignia "Nuevo".',
  },
  {
    token: 'ring',
    label: 'Anillo de foco',
    hint: 'Resplandor al enfocar el buscador del catálogo o el formulario de reseñas (accesibilidad de teclado).',
  },
];

/** Conjunto de tokens permitidos, derivado de la lista de campos. */
const ALLOWED_TOKENS = new Set<string>(PORTAL_THEME_FIELDS.map((field) => field.token));

/**
 * Filtra un tema arbitrario dejando SÓLO tokens conocidos con valor string no
 * vacío. Defensa en profundidad: aunque el backend ya valida, el portal público
 * nunca aplica una clave/propiedad fuera del subconjunto seguro.
 */
export function safePortalTheme(raw: unknown): PortalTheme {
  if (raw === null || typeof raw !== 'object') return {};
  const out: PortalTheme = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (ALLOWED_TOKENS.has(key) && typeof value === 'string' && value.trim() !== '') {
      out[key as PortalThemeToken] = value;
    }
  }
  return out;
}

const LOGO_POSITIONS = new Set<string>(['left', 'center', 'right']);
const SOCIAL_NAV_POSITIONS = new Set<string>(['left', 'right']);

/** Same defense-in-depth as `safePortalTheme` — an unexpected value from the
 *  public API falls back to the design-system default instead of propagating. */
export function safeLogoPosition(raw: unknown): PortalLogoPosition {
  return typeof raw === 'string' && LOGO_POSITIONS.has(raw) ? (raw as PortalLogoPosition) : 'left';
}

export function safeSocialNavPosition(raw: unknown): PortalSocialNavPosition {
  return typeof raw === 'string' && SOCIAL_NAV_POSITIONS.has(raw)
    ? (raw as PortalSocialNavPosition)
    : 'right';
}
