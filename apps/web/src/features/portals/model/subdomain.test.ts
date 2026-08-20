import { describe, expect, it } from 'vitest';
import { resolveOrgSubdomain } from './subdomain';

describe('resolveOrgSubdomain', () => {
  it('returns null when no base domain is configured', () => {
    expect(resolveOrgSubdomain('patitas.adoptafacil.com', undefined)).toBeNull();
  });

  it('returns null for the bare base domain (general portal, not an org subdomain)', () => {
    expect(resolveOrgSubdomain('adoptafacil.com', 'adoptafacil.com')).toBeNull();
  });

  it('returns the label for a real organization subdomain', () => {
    expect(resolveOrgSubdomain('patitas.adoptafacil.com', 'adoptafacil.com')).toBe('patitas');
  });

  it('is case-insensitive on both the hostname and the configured base domain', () => {
    expect(resolveOrgSubdomain('Patitas.AdoptaFacil.COM', 'ADOPTAFACIL.com')).toBe('patitas');
  });

  for (const reserved of ['www', 'app', 'api', 'admin', 'staging']) {
    it(`treats the reserved label "${reserved}" as NOT an organization subdomain`, () => {
      expect(resolveOrgSubdomain(`${reserved}.adoptafacil.com`, 'adoptafacil.com')).toBeNull();
    });
  }

  it('returns null for a nested subdomain (unsupported shape, never guesses)', () => {
    expect(resolveOrgSubdomain('sub.patitas.adoptafacil.com', 'adoptafacil.com')).toBeNull();
  });

  it('returns null for a completely unrelated host (localhost)', () => {
    expect(resolveOrgSubdomain('localhost', 'adoptafacil.com')).toBeNull();
  });

  it('returns null for a host on a different domain entirely (e.g. a staging preview URL)', () => {
    expect(resolveOrgSubdomain('adoptafacil-web-preview.vercel.app', 'adoptafacil.com')).toBeNull();
  });

  it('returns null for an empty hostname', () => {
    expect(resolveOrgSubdomain('', 'adoptafacil.com')).toBeNull();
  });
});
