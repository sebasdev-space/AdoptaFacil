import type { PortalTheme, PortalThemeToken } from '@adoptafacil/contracts';

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

/** Campos editables del tema, en orden de presentación. Fuente única de la UI. */
export const PORTAL_THEME_FIELDS: readonly PortalThemeField[] = [
  { token: 'primary', label: 'Color primario', kind: 'color', hint: 'HSL: "H S% L%"' },
  {
    token: 'primary-foreground',
    label: 'Texto sobre primario',
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
  { token: 'radius', label: 'Radio de esquinas', kind: 'length', hint: 'p. ej. "0.5rem", "8px"' },
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
