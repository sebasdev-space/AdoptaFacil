import { z } from 'zod';
import type { PortalColorToken, PortalTheme, PortalThemeToken } from '@adoptafacil/contracts';

/**
 * M14 personalization (T-027) — runtime validation for a tenant's brand tokens.
 *
 * SECURITY: personalization is by TOKENS ONLY (never arbitrary CSS/HTML), so this
 * is the deny-by-default gate. `.strict()` rejects unknown token keys; color
 * values must be bare HSL channels within range; `radius` is a bounded CSS length.
 * A cross-field refinement enforces a MINIMUM CONTRAST between each color and its
 * `-foreground` pair (WCAG AA for normal text) so a tenant cannot ship an
 * unreadable (or intentionally hostile) portal.
 */

/** Minimum contrast ratio required between a color and its foreground pair. */
export const MIN_CONTRAST_RATIO = 4.5;

/** The color tokens an org may override, each paired with its foreground. */
export const PORTAL_COLOR_PAIRS: ReadonlyArray<[PortalColorToken, PortalColorToken]> = [
  ['primary', 'primary-foreground'],
  ['secondary', 'secondary-foreground'],
  ['accent', 'accent-foreground'],
];

/** Bare HSL channels, e.g. "142 72% 29%". Ranges checked in `.superRefine`. */
const HSL_CHANNELS = /^(\d{1,3})\s+(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/;
/** A small, bounded CSS length for the corner radius. */
const RADIUS = /^(\d{1,2}(?:\.\d+)?)(px|rem|em)$/;

const colorToken = z
  .string()
  .trim()
  .regex(HSL_CHANNELS, 'Debe ser un color HSL en canales "H S% L%" (p. ej. "142 72% 29%")')
  .refine((value) => {
    const m = HSL_CHANNELS.exec(value);
    if (!m) return false;
    const [h, s, l] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return h <= 360 && s <= 100 && l <= 100;
  }, 'Canales HSL fuera de rango (H≤360, S≤100%, L≤100%)');

const radiusToken = z
  .string()
  .trim()
  .regex(RADIUS, 'Debe ser una longitud CSS acotada (p. ej. "0.5rem", "8px")')
  .refine((value) => {
    const m = RADIUS.exec(value);
    return m ? Number(m[1]) <= 64 : false;
  }, 'Radio demasiado grande');

/** Parse bare HSL channels into their numeric components (or null). */
function parseHsl(value: string): { h: number; s: number; l: number } | null {
  const m = HSL_CHANNELS.exec(value.trim());
  if (!m) return null;
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/** Relative luminance (WCAG) of an HSL color, via HSL→sRGB→linear. */
function relativeLuminance({ h, s, l }: { h: number; s: number; l: number }): number {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  const [r1, g1, b1] = ((): [number, number, number] => {
    if (h < 60) return [c, x, 0];
    if (h < 120) return [x, c, 0];
    if (h < 180) return [0, c, x];
    if (h < 240) return [0, x, c];
    if (h < 300) return [x, 0, c];
    return [c, 0, x];
  })();
  const toLinear = (channel: number): number => {
    const v = channel + m;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r1) + 0.7152 * toLinear(g1) + 0.0722 * toLinear(b1);
}

/** WCAG contrast ratio between two bare-HSL colors (1..21), or null if unparsable. */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHsl(a);
  const cb = parseHsl(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The zod object for a `PortalTheme` token bag (strict: unknown keys rejected). */
export const portalThemeTokensSchema = z
  .object({
    primary: colorToken.optional(),
    'primary-foreground': colorToken.optional(),
    secondary: colorToken.optional(),
    'secondary-foreground': colorToken.optional(),
    accent: colorToken.optional(),
    'accent-foreground': colorToken.optional(),
    ring: colorToken.optional(),
    radius: radiusToken.optional(),
  } satisfies Record<PortalThemeToken, z.ZodTypeAny>)
  .strict()
  .superRefine((tokens, ctx) => {
    // Minimum contrast for each color/foreground pair present in the SAME update.
    for (const [base, fg] of PORTAL_COLOR_PAIRS) {
      const baseValue = tokens[base];
      const fgValue = tokens[fg];
      if (baseValue === undefined || fgValue === undefined) continue;
      const ratio = contrastRatio(baseValue, fgValue);
      if (ratio !== null && ratio < MIN_CONTRAST_RATIO) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [fg],
          message: `Contraste insuficiente entre ${base} y ${fg} (${ratio.toFixed(
            2,
          )}:1 < ${MIN_CONTRAST_RATIO}:1)`,
        });
      }
    }
  });

/** PUT /portals/theme body. */
export const updatePortalThemeSchema = z
  .object({
    tokens: portalThemeTokensSchema,
  })
  .strict();

export type ValidatedPortalTheme = PortalTheme;
