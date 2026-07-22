import { describe, expect, it } from 'vitest';
import { PORTAL_THEME_FIELDS, safePortalTheme } from './theme';

/** T-027 · client-side defence: only the known safe token subset is ever kept
 *  (the backend is the authority, but the portal never applies an unknown key). */
describe('safePortalTheme', () => {
  it('keeps only known tokens with non-empty string values', () => {
    const result = safePortalTheme({
      primary: '24 90% 45%',
      radius: '0.5rem',
      'font-sans': 'url(evil)', // unknown/unsafe → dropped
      background: '0 0% 100%', // not in the editable subset → dropped
      accent: '', // empty → dropped
      ring: 42, // non-string → dropped
    });
    expect(result).toEqual({ primary: '24 90% 45%', radius: '0.5rem' });
  });

  it('returns an empty theme for non-object input', () => {
    expect(safePortalTheme(undefined)).toEqual({});
    expect(safePortalTheme(null)).toEqual({});
    expect(safePortalTheme('nope')).toEqual({});
  });

  it('exposes a stable set of editable fields for the config UI', () => {
    expect(PORTAL_THEME_FIELDS.map((f) => f.token)).toContain('primary');
    expect(PORTAL_THEME_FIELDS.every((f) => f.label.length > 0)).toBe(true);
  });
});
