import { describe, expect, it } from 'vitest';
import type { Organization } from '@adoptafacil/contracts';
import { computeProfileCompleteness, PROFILE_COMPLETENESS_FIELDS } from './profile-completeness';

function org(over: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('computeProfileCompleteness (S2-05)', () => {
  it('is 0% when every field is empty', () => {
    const result = computeProfileCompleteness(org());
    expect(result.filled).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.missingLabels).toHaveLength(PROFILE_COMPLETENESS_FIELDS.length);
  });

  it('counts a partial profile against real fields, not a hardcoded constant', () => {
    const result = computeProfileCompleteness(
      org({
        name: 'Refugio Patitas',
        description: 'Rescatamos animales.',
        location: { city: 'Bogotá' },
      }),
    );
    expect(result.filled).toBe(3);
    expect(result.total).toBe(PROFILE_COMPLETENESS_FIELDS.length);
    expect(result.missingLabels).not.toContain('Nombre');
    expect(result.missingLabels).toContain('Logo');
  });

  it('is 100% when every field is filled', () => {
    const result = computeProfileCompleteness(
      org({
        name: 'Refugio Patitas',
        description: 'Rescatamos animales.',
        logoUrl: 'https://cdn.test/logo.png',
        coverPhotos: ['https://cdn.test/cover.png'],
        location: { city: 'Bogotá' },
        whatsapp: '3001234567',
        socialLinks: { instagram: 'https://instagram.com/x' },
        aboutUs: 'Somos un equipo voluntario.',
        slug: 'patitas',
      }),
    );
    expect(result.filled).toBe(result.total);
    expect(result.percent).toBe(100);
    expect(result.missingLabels).toHaveLength(0);
  });

  it('an empty-string cover photo does not count as filled (defensive against a stray [""])', () => {
    const result = computeProfileCompleteness(org({ name: 'X', coverPhotos: [''] }));
    expect(result.missingLabels).toContain('Portada');
  });

  it('counts EITHER correo or whatsapp as satisfying the single "contact channel" field', () => {
    const withEmail = computeProfileCompleteness(org({ name: 'X', contactEmail: 'a@b.com' }));
    const withWhatsapp = computeProfileCompleteness(org({ name: 'X', whatsapp: '3000000000' }));
    expect(withEmail.missingLabels).not.toContain('Correo o WhatsApp');
    expect(withWhatsapp.missingLabels).not.toContain('Correo o WhatsApp');
  });
});
