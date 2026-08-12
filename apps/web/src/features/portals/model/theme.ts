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
  /** Tipo de valor: color en canales HSL o una longitud CSS. */
  kind: 'color' | 'length';
  /** Texto de ayuda / formato esperado. */
  hint: string;
}

/** Opciones predefinidas para "Radio de esquinas" — reemplaza el input de
 *  texto libre por un selector cerrado; cada valor ya cumple el formato/rango
 *  que exige el backend (`RADIUS` en `portals.schemas.ts`, máx. 64px/rem/em). */
export const RADIUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '0px', label: 'Sin redondeo' },
  { value: '0.25rem', label: 'Pequeño' },
  { value: '0.5rem', label: 'Mediano' },
  { value: '0.75rem', label: 'Grande' },
  { value: '1rem', label: 'Extra grande' },
];

/** Campos editables del tema, en orden de presentación. Fuente única de la UI. */
export const PORTAL_THEME_FIELDS: readonly PortalThemeField[] = [
  // Labels en español simple (S2-REORG) — un dueño no técnico nunca necesita
  // ver "token"/"HSL": el color lo elige con el selector nativo, el hint (con
  // el formato crudo) solo aparece en un tooltip al pasar el mouse.
  { token: 'primary', label: 'Color principal', kind: 'color', hint: 'HSL: "H S% L%"' },
  {
    token: 'primary-foreground',
    label: 'Texto sobre el principal',
    kind: 'color',
    hint: 'HSL: "H S% L%"',
  },
  { token: 'secondary', label: 'Color secundario', kind: 'color', hint: 'HSL: "H S% L%"' },
  {
    token: 'secondary-foreground',
    label: 'Texto sobre secundario',
    kind: 'color',
    hint: 'HSL: "H S% L%"',
  },
  { token: 'accent', label: 'Color de acento', kind: 'color', hint: 'HSL: "H S% L%"' },
  {
    token: 'accent-foreground',
    label: 'Texto sobre acento',
    kind: 'color',
    hint: 'HSL: "H S% L%"',
  },
  { token: 'ring', label: 'Anillo de foco', kind: 'color', hint: 'HSL: "H S% L%"' },
  {
    token: 'radius',
    label: 'Radio de esquinas',
    kind: 'length',
    hint: 'Qué tan redondeadas se ven las esquinas de botones y tarjetas.',
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
