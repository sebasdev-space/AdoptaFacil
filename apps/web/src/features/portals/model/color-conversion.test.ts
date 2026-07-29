import { describe, expect, it } from 'vitest';
import { hexToHslString, hslStringToHex, hslToHex, parseHslString } from './color-conversion';

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
