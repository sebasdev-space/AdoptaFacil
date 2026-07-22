import { contrastRatio, MIN_CONTRAST_RATIO, updatePortalThemeSchema } from './portals.schemas';

/** T-027 · token validation is the deny-by-default gate for M14 personalization
 *  (tokens only, never arbitrary CSS): format, range, unknown keys and minimum
 *  contrast between each color and its foreground pair. */
describe('portal theme token validation', () => {
  const parse = (tokens: Record<string, unknown>) => updatePortalThemeSchema.safeParse({ tokens });

  it('accepts a valid safe subset (HSL colors + radius)', () => {
    const result = parse({
      primary: '142 72% 29%',
      'primary-foreground': '0 0% 100%',
      radius: '0.5rem',
      ring: '142 72% 29%',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown / unsafe token keys (strict)', () => {
    // A font-family or an arbitrary property is never a valid brand token.
    expect(parse({ 'font-sans': 'url(evil)' }).success).toBe(false);
    expect(parse({ background: '0 0% 100%' }).success).toBe(false);
    expect(parse({ '--evil': 'x' }).success).toBe(false);
  });

  it('rejects malformed color values (not bare HSL channels)', () => {
    expect(parse({ primary: '#ff0000' }).success).toBe(false);
    expect(parse({ primary: 'red' }).success).toBe(false);
    expect(parse({ primary: 'hsl(142 72% 29%)' }).success).toBe(false);
    // Would-be CSS injection via a token value is rejected by the format regex.
    expect(parse({ primary: '142 72% 29%; } body{display:none' }).success).toBe(false);
  });

  it('rejects HSL channels out of range', () => {
    expect(parse({ primary: '400 72% 29%' }).success).toBe(false);
    expect(parse({ primary: '142 120% 29%' }).success).toBe(false);
  });

  it('validates the radius as a bounded CSS length', () => {
    expect(parse({ radius: '8px' }).success).toBe(true);
    expect(parse({ radius: '0.75rem' }).success).toBe(true);
    expect(parse({ radius: '999px' }).success).toBe(false);
    expect(parse({ radius: '10vw' }).success).toBe(false);
    expect(parse({ radius: 'calc(1px)' }).success).toBe(false);
  });

  it('rejects a color/foreground pair below the minimum contrast', () => {
    // Light green on white → unreadable.
    const result = parse({ primary: '142 72% 85%', 'primary-foreground': '0 0% 100%' });
    expect(result.success).toBe(false);
  });

  it('accepts a color/foreground pair that meets the minimum contrast', () => {
    const result = parse({ primary: '142 72% 29%', 'primary-foreground': '0 0% 100%' });
    expect(result.success).toBe(true);
  });

  it('only checks contrast when BOTH members of a pair are present', () => {
    // A lone base color (no foreground in the same update) is not contrast-checked.
    expect(parse({ primary: '142 72% 85%' }).success).toBe(true);
  });
});

describe('contrastRatio', () => {
  it('computes the extremes correctly', () => {
    // Black vs white is the maximum WCAG ratio (21:1).
    expect(contrastRatio('0 0% 0%', '0 0% 100%')).toBeCloseTo(21, 1);
    // A color against itself is 1:1.
    expect(contrastRatio('142 72% 29%', '142 72% 29%')).toBeCloseTo(1, 5);
  });

  it('agrees with the AA threshold used by the schema', () => {
    const ratio = contrastRatio('142 72% 29%', '0 0% 100%');
    expect(ratio).not.toBeNull();
    expect(ratio as number).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
  });

  it('returns null for unparsable input', () => {
    expect(contrastRatio('nope', '0 0% 100%')).toBeNull();
  });
});
