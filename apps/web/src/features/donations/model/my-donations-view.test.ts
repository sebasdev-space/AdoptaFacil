import { describe, expect, it } from 'vitest';
import type { Donation } from '@adoptafacil/contracts';
import {
  DONATION_STATUS_BADGE_VARIANT,
  DONATION_STATUS_LABELS,
  normalizeDonations,
  organizationLabel,
} from './my-donations-view';

describe('normalizeDonations (T-064, T-028c guard)', () => {
  it('passes through a direct array (the real shape of GET /donations/mine)', () => {
    const arr = [{ id: '1' }];
    expect(normalizeDonations(arr)).toBe(arr);
  });

  it('normalizes any non-array response to [] instead of crashing on .map', () => {
    expect(normalizeDonations({ items: [{ id: '1' }] })).toEqual([]);
    expect(normalizeDonations(null)).toEqual([]);
    expect(normalizeDonations(undefined)).toEqual([]);
    expect(normalizeDonations('unexpected')).toEqual([]);
  });
});

describe('organizationLabel', () => {
  it('F2-03: shows the REAL organization name when the backend resolves it (S1-02)', () => {
    const donation: Pick<Donation, 'organizationId' | 'organizationName'> = {
      organizationId: '08d734c6-1900-4bf4-b3e5-d6468479cf8b',
      organizationName: 'Refugio Patitas',
    };
    expect(organizationLabel(donation)).toBe('Refugio Patitas');
  });

  it('falls back to a short, stable identifier when the name is absent — never fabricated', () => {
    const donation: Pick<Donation, 'organizationId' | 'organizationName'> = {
      organizationId: '08d734c6-1900-4bf4-b3e5-d6468479cf8b',
      organizationName: undefined,
    };
    expect(organizationLabel(donation)).toBe('Organización #08d734c6');
  });
});

describe('DONATION_STATUS_LABELS / DONATION_STATUS_BADGE_VARIANT', () => {
  it('covers every DonationStatus with an es-CO label and a semantic variant', () => {
    expect(DONATION_STATUS_LABELS).toEqual({
      pending: 'Pendiente',
      approved: 'Aprobada',
      declined: 'Rechazada',
    });
    expect(DONATION_STATUS_BADGE_VARIANT).toEqual({
      pending: 'warning',
      approved: 'success',
      declined: 'destructive',
    });
  });
});
