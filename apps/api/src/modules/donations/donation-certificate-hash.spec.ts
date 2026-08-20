import {
  canonicalCertificateString,
  computeCertificateHash,
  generateCertificateCode,
  type DonationCertificatePayload,
} from './donation-certificate-hash';

const payload: DonationCertificatePayload = {
  organizationName: 'Refugio Huellas',
  organizationNit: '900123456-1',
  donorName: 'María Restrepo',
  amount: 150000,
  currency: 'COP',
  issuedAt: '2026-08-20T15:30:00.000Z',
  donationId: '11111111-1111-1111-1111-111111111111',
};

describe('donation certificate hash', () => {
  it('is deterministic and a 64-char sha256 hex digest', () => {
    const h = computeCertificateHash(payload);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computeCertificateHash(payload)).toBe(h);
  });

  it('is INVARIANT to object key order (canonical serialization)', () => {
    const reordered: DonationCertificatePayload = {
      donationId: payload.donationId,
      issuedAt: payload.issuedAt,
      currency: payload.currency,
      amount: payload.amount,
      donorName: payload.donorName,
      organizationNit: payload.organizationNit,
      organizationName: payload.organizationName,
    };
    expect(canonicalCertificateString(reordered)).toBe(canonicalCertificateString(payload));
    expect(computeCertificateHash(reordered)).toBe(computeCertificateHash(payload));
  });

  it('changes when any content changes (tamper-evident seal)', () => {
    const tampered = { ...payload, amount: payload.amount + 1 };
    expect(computeCertificateHash(tampered)).not.toBe(computeCertificateHash(payload));
  });
});

describe('generateCertificateCode', () => {
  it('matches the ADF-CERT-<año>-<6 dígitos> format', () => {
    expect(generateCertificateCode(2026)).toMatch(/^ADF-CERT-2026-\d{6}$/);
  });

  it('is not trivially constant across calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateCertificateCode(2026)));
    expect(codes.size).toBeGreaterThan(1);
  });
});
