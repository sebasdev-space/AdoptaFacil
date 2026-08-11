import { describe, expect, it } from 'vitest';
import {
  bestContrastingBackground,
  bestContrastingForeground,
  contrastRatio,
  hexToHslString,
  hslStringToHex,
  hslToHex,
  MIN_CONTRAST_RATIO,
  parseHslString,
} from './color-conversion';

describe('parseHslString (T-D03)', () => {
  it('parses a bare HSL string ("H S% L%")', () => {
    expect(parseHslString('142 72% 29%')).toEqual({ h: 142, s: 72, l: 29 });
  });

  it('returns null for a malformed/empty string (never throws)', () => {
    expect(parseHslString('')).toBeNull();
    expect(parseHslString('hsl(142, 72%, 29%)')).toBeNull();
    expect(parseHslString('not a color')).toBeNull();
  });
});

describe('hslToHex / hslStringToHex (T-D03)', () => {
  it('converts the real AdoptaFácil primary green to its known hex', () => {
    // --primary: 142 72% 29% (packages/ui/src/styles/globals.css).
    expect(hslToHex(142, 72, 29)).toBe('#157f3c');
  });

  it('converts pure white/black correctly (edge cases: s=0)', () => {
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
    expect(hslToHex(0, 0, 0)).toBe('#000000');
  });

  it('falls back to a neutral color for an unparseable HSL string', () => {
    expect(hslStringToHex('', '#abcdef')).toBe('#abcdef');
    expect(hslStringToHex('garbage')).toBe('#808080');
  });
});

describe('hexToHslString round-trip (T-D03)', () => {
  it('round-trips within ±1 unit of rounding drift for real design tokens', () => {
    const original = { h: 142, s: 72, l: 29 };
    const hex = hslToHex(original.h, original.s, original.l);
    const back = hexToHslString(hex);
    const [h, s, l] = back.split(/\s+/).map((part) => parseInt(part, 10));
    expect(Math.abs(h - original.h)).toBeLessThanOrEqual(1);
    expect(Math.abs(s - original.s)).toBeLessThanOrEqual(1);
    expect(Math.abs(l - original.l)).toBeLessThanOrEqual(1);
  });

  it('formats as "H S% L%" — the exact bare format the backend expects', () => {
    expect(hexToHslString('#ffffff')).toBe('0 0% 100%');
    expect(hexToHslString('#000000')).toBe('0 0% 0%');
  });
});

describe('contrastRatio (T-PORTAL-CONTRAST) — mirrors the backend formula exactly', () => {
  it('computes the extremes correctly', () => {
    expect(contrastRatio('0 0% 0%', '0 0% 100%')).toBeCloseTo(21, 1);
    expect(contrastRatio('142 72% 29%', '142 72% 29%')).toBeCloseTo(1, 5);
  });

  it('agrees with the AA threshold used by the backend schema', () => {
    const ratio = contrastRatio('142 72% 29%', '0 0% 100%');
    expect(ratio).not.toBeNull();
    expect(ratio as number).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
  });

  it('returns null for unparsable input', () => {
    expect(contrastRatio('nope', '0 0% 100%')).toBeNull();
  });
});

describe('bestContrastingForeground (T-PORTAL-CONTRAST bug fix)', () => {
  it('picks near-black for a pale/light background', () => {
    const fg = bestContrastingForeground('48 96% 89%'); // pale yellow
    expect(contrastRatio('48 96% 89%', fg)).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
  });

  it('picks white for a dark background', () => {
    const fg = bestContrastingForeground('222 20% 9%'); // near-black
    expect(contrastRatio('222 20% 9%', fg)).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
  });
});

describe('bestContrastingBackground (T-PORTAL-CONTRAST bug fix, reverse direction)', () => {
  it('keeps the background hue when a lighter/darker shade of it already works', () => {
    // A muted blue-ish background against near-black text: darkening the
    // SAME hue is enough, no need to fall back to flat black.
    const bg = bestContrastingBackground('213 20% 93%', '214 32% 18%');
    expect(bg.startsWith('213 20%')).toBe(true);
    expect(contrastRatio(bg, '214 32% 18%')).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
  });

  it('falls back to a guaranteed-safe pure black/white when no hue-preserving shade reaches the minimum (real repro)', () => {
    // Exact case reported after the first fix shipped: a dark, saturated
    // background ("0 56% 42%") whose foreground was edited directly to a
    // clashing bright red ("0 100% 48%") — same hue family, low contrast.
    // Re-lighting/darkening WITHIN that same hue still falls short, so this
    // must fall back to whichever of pure white/black actually clears 4.5:1.
    const bg = bestContrastingBackground('0 56% 42%', '0 100% 48%');
    expect(contrastRatio(bg, '0 100% 48%')).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
  });
});
