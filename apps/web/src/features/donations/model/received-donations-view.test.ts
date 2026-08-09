import { describe, expect, it } from 'vitest';
import type { DonationWithReceipt } from '@adoptafacil/contracts';
import {
  donationConceptLabel,
  normalizeReceivedDonations,
  receivedDonorLabel,
} from './received-donations-view';

const BASE: DonationWithReceipt = {
  id: 'd-1',
  organizationId: 'org-1',
  donorUserId: 'donor-1',
  concept: { kind: 'organization', id: 'org-1' },
  commissionPayer: 'organization',
  intendedAmount: 50000,
  amountCharged: 50000,
  currency: 'COP',
  breakdown: {
    amountCharged: 50000,
    gross: 50000,
    platformFee: 2000,
    platformIva: 380,
    gatewayFee: 2025,
    gatewayIva: 385,
    net: 45210,
  },
  collectionId: 'test_abc',
  status: 'pending',
  createdAt: '2026-07-28T21:25:22.299Z',
  updatedAt: '2026-07-28T21:25:22.299Z',
};

describe('normalizeReceivedDonations', () => {
  it('passes through a real array untouched', () => {
    expect(normalizeReceivedDonations([BASE])).toEqual([BASE]);
  });

  it('defends against a non-array body (never .map() on garbage)', () => {
    expect(normalizeReceivedDonations({ items: [BASE] })).toEqual([]);
    expect(normalizeReceivedDonations(null)).toEqual([]);
    expect(normalizeReceivedDonations(undefined)).toEqual([]);
  });
});

describe('receivedDonorLabel', () => {
  it('shows the real donor name from the receipt when the donation is approved', () => {
    const approved: DonationWithReceipt = {
      ...BASE,
      status: 'approved',
      receipt: {
        id: 'r-1',
        organizationId: 'org-1',
        donationId: 'd-1',
        dedupKey: 'evt-1',
        donor: { fullName: 'Camilo Torres', email: 'camilo@test.local' },
        intendedAmount: 50000,
        breakdown: BASE.breakdown,
        issuedAt: '2026-07-28T22:00:00.000Z',
      },
    };
    expect(receivedDonorLabel(approved)).toBe('Camilo Torres');
  });

  it('falls back to the email when the receipt has no full name', () => {
    const approved: DonationWithReceipt = {
      ...BASE,
      status: 'approved',
      receipt: {
        id: 'r-1',
        organizationId: 'org-1',
        donationId: 'd-1',
        dedupKey: 'evt-1',
        donor: { email: 'camilo@test.local' },
        intendedAmount: 50000,
        breakdown: BASE.breakdown,
        issuedAt: '2026-07-28T22:00:00.000Z',
      },
    };
    expect(receivedDonorLabel(approved)).toBe('camilo@test.local');
  });

  it('never fabricates a donor identity for a pending donation (no receipt yet)', () => {
    expect(receivedDonorLabel({ ...BASE, status: 'pending' })).toBe('Recibo pendiente');
  });

  it('never fabricates a donor identity for a declined donation', () => {
    expect(receivedDonorLabel({ ...BASE, status: 'declined' })).toBe('Recibo pendiente');
  });
});

describe('donationConceptLabel', () => {
  it('labels a general organization donation without a raw id', () => {
    expect(donationConceptLabel({ kind: 'organization', id: 'org-1' })).toBe('Donación general');
  });

  it('labels an animal-earmarked donation with a short id (never a fabricated name)', () => {
    expect(donationConceptLabel({ kind: 'animal', id: '08d734c6-1900-4bf4-b3e5' })).toBe(
      'Animal #08d734c6',
    );
  });

  it('labels a campaign-earmarked donation with a short id (never a fabricated name)', () => {
    expect(donationConceptLabel({ kind: 'campaign', id: 'c0ffee12-abcd-4321-9999' })).toBe(
      'Campaña #c0ffee12',
    );
  });
});
