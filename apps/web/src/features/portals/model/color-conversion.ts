/**
 * Pure HSL ↔ hex color conversion (T-D03). The backend stores/validates BARE HSL
 * channels ("H S% L%" — no commas, no `hsl()` wrapper); these helpers exist ONLY
 * to drive a native `<input type="color">` (which speaks hex). The stored/PUT
 * format the backend expects NEVER changes — conversion is UI-only.
 */

/** Parse a bare HSL string ("142 72% 29%") into numeric channels, or `null` if
 *  it does not match the expected format. */
export function parseHslString(hsl: string): { h: number; s: number; l: number } | null {
  const match = hsl.trim().match(/^(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

/** HSL (h in [0,360), s/l in [0,100]) → hex `"#rrggbb"`. */
export function hslToHex(h: number, s: number, l: number): string {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = s / 100;
  const ll = l / 100;
  let r: number;
  let g: number;
  let b: number;
  if (ss === 0) {
    r = g = b = ll;
  } else {
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    r = hue2rgb(p, q, hh + 1 / 3);
    g = hue2rgb(p, q, hh);
    b = hue2rgb(p, q, hh - 1 / 3);
  }
  const toHex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** hex `"#rrggbb"` (or `"rrggbb"`) → HSL, channels rounded to whole numbers. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const normalized = hex.replace(/^#/, '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Bare HSL string → hex, or `fallback` when the string is empty/unparseable
 *  (e.g. the field has not been customized yet). */
export function hslStringToHex(hsl: string, fallback = '#808080'): string {
  const parsed = parseHslString(hsl);
  if (!parsed) return fallback;
  return hslToHex(parsed.h, parsed.s, parsed.l);
}

/** hex → bare HSL string ("142 72% 29%"), the exact format the backend expects. */
export function hexToHslString(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return `${h} ${s}% ${l}%`;
}

/**
 * WCAG relative luminance + contrast ratio for a bare-HSL color — MIRRORS
 * `contrastRatio`/`relativeLuminance` in `apps/api/src/modules/portals/
 * portals.schemas.ts` (same formula, same 4.5:1 minimum for normal text).
 * Duplicated on purpose (small, self-contained math, same convention as
 * `ageLabel` elsewhere in this codebase) so the FRONTEND can pre-empt the
 * exact rejection the backend's `.superRefine()` enforces, instead of only
 * finding out after a failed save (T-PORTAL-CONTRAST).
 */
function relativeLuminance(h: number, s: number, l: number): number {
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

/** WCAG contrast ratio (1..21) between two bare-HSL strings, or `null` if
 *  either is unparsable. */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHslString(a);
  const cb = parseHslString(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca.h, ca.s, ca.l);
  const lb = relativeLuminance(cb.h, cb.s, cb.l);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Same threshold as the backend's `MIN_CONTRAST_RATIO` (WCAG AA, normal text). */
export const MIN_CONTRAST_RATIO = 4.5;

const AUTO_FOREGROUND_LIGHT = '0 0% 100%';
const AUTO_FOREGROUND_DARK = '222 20% 9%';

/**
 * Picks whichever of pure white/near-black gives the BEST contrast against
 * `background` — used to auto-correct a color pair's foreground when the
 * user changes only the background, so the pair never becomes unreadable
 * (see `pairsWithSufficientContrast` at the call site for when this fires).
 */
export function bestContrastingForeground(background: string): string {
  const vsLight = contrastRatio(background, AUTO_FOREGROUND_LIGHT) ?? 0;
  const vsDark = contrastRatio(background, AUTO_FOREGROUND_DARK) ?? 0;
  return vsLight >= vsDark ? AUTO_FOREGROUND_LIGHT : AUTO_FOREGROUND_DARK;
}
