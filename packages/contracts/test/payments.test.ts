import { describe, expect, it } from 'vitest';
import {
  computeBreakdown,
  FakePaymentAdapter,
  PAYMENT_FEE_CONFIG,
  roundPesosHalfUp,
  type CommissionPayer,
  type PaymentBreakdown,
} from '../src/payments';

/** The RNF12 sum invariant: gross reconciles to the peso against net + commissions. */
function assertSumInvariant(b: PaymentBreakdown): void {
  expect(b.gross).toBe(b.net + b.platformFee + b.platformIva + b.gatewayFee + b.gatewayIva);
  // Everything is integer pesos (never float).
  for (const v of Object.values(b)) expect(Number.isInteger(v)).toBe(true);
}

const AMOUNTS = [1000, 1250, 5000, 10000, 33333, 100000, 1234567];
const MODES: CommissionPayer[] = ['organization', 'donor'];

describe('roundPesosHalfUp', () => {
  it('rounds half UP for positive amounts', () => {
    expect(roundPesosHalfUp(9.5)).toBe(10);
    expect(roundPesosHalfUp(9.49)).toBe(9);
    expect(roundPesosHalfUp(139.27)).toBe(139);
    expect(roundPesosHalfUp(700)).toBe(700);
  });
});

describe('computeBreakdown — sum invariant (RNF12)', () => {
  for (const mode of MODES) {
    for (const amount of AMOUNTS) {
      it(`reconciles to the peso: ${mode} / ${amount}`, () => {
        assertSumInvariant(computeBreakdown(amount, mode));
      });
    }
  }
});

describe("computeBreakdown — 'organization' mode (org absorbs commissions)", () => {
  it('charges exactly the intended amount; net is the remainder (< intended)', () => {
    const b = computeBreakdown(100000, 'organization');
    expect(b.amountCharged).toBe(100000);
    expect(b.gross).toBe(100000);
    expect(b.net).toBeLessThan(100000);
    // 4% platform + its 19% IVA.
    expect(b.platformFee).toBe(4000);
    expect(b.platformIva).toBe(760);
    // 2.65% + 700 gateway + its 19% IVA.
    expect(b.gatewayFee).toBe(3350);
    expect(b.gatewayIva).toBe(roundPesosHalfUp(0.19 * 3350));
    assertSumInvariant(b);
  });

  it('applies half-up rounding on the IVA (9.5 → 10)', () => {
    // intended 1250 → platformFee 50 → platformIva 0.19*50 = 9.5 → 10.
    const b = computeBreakdown(1250, 'organization');
    expect(b.platformFee).toBe(50);
    expect(b.platformIva).toBe(10);
    assertSumInvariant(b);
  });
});

describe("computeBreakdown — 'donor' mode (donor covers commissions)", () => {
  it('grosses up so the org receives ≈ the intended amount', () => {
    for (const amount of AMOUNTS) {
      const b = computeBreakdown(amount, 'donor');
      expect(b.amountCharged).toBeGreaterThan(amount);
      expect(b.gross).toBe(b.amountCharged);
      // net lands on the intended amount within a couple pesos of rounding drift.
      expect(Math.abs(b.net - amount)).toBeLessThanOrEqual(2);
      assertSumInvariant(b);
    }
  });

  it('a donor is charged more than an org for the same intended net', () => {
    const org = computeBreakdown(100000, 'organization');
    const donor = computeBreakdown(100000, 'donor');
    expect(donor.amountCharged).toBeGreaterThan(org.amountCharged);
    expect(donor.net).toBeGreaterThan(org.net);
  });
});

describe('computeBreakdown — guards', () => {
  it('rejects non-positive or non-integer amounts', () => {
    expect(() => computeBreakdown(0, 'donor')).toThrow(RangeError);
    expect(() => computeBreakdown(-100, 'organization')).toThrow(RangeError);
    expect(() => computeBreakdown(100.5, 'donor')).toThrow(RangeError);
  });
});

describe('PAYMENT_FEE_CONFIG', () => {
  it('encodes the closed commission decisions', () => {
    expect(PAYMENT_FEE_CONFIG).toEqual({
      platformRate: 0.04,
      gatewayRate: 0.0265,
      gatewayFixed: 700,
      ivaRate: 0.19,
    });
  });
});

describe('FakePaymentAdapter — deterministic + idempotent', () => {
  const port = new FakePaymentAdapter();

  it('same idempotencyKey → same collection id and breakdown', async () => {
    const input = {
      intendedAmount: 50000,
      currency: 'COP' as const,
      concept: { kind: 'campaign' as const, id: 'c1' },
      commissionPayer: 'donor' as const,
      idempotencyKey: 'key-abc',
    };
    const a = await port.createCollection(input);
    const b = await port.createCollection(input);
    expect(a.collectionId).toBe(b.collectionId);
    expect(a.breakdown).toEqual(b.breakdown);
    expect(a.status).toBe('approved');
  });

  it('different idempotencyKey → different collection id', async () => {
    const base = {
      intendedAmount: 50000,
      currency: 'COP' as const,
      concept: { kind: 'organization' as const, id: 'o1' },
      commissionPayer: 'organization' as const,
    };
    const a = await port.createCollection({ ...base, idempotencyKey: 'k1' });
    const b = await port.createCollection({ ...base, idempotencyKey: 'k2' });
    expect(a.collectionId).not.toBe(b.collectionId);
  });

  it('payout is idempotent and scheduled', async () => {
    const input = { beneficiaryOrgId: 'org-1', amount: 90000, idempotencyKey: 'pay-1' };
    const a = await port.createPayout(input);
    const b = await port.createPayout(input);
    expect(a.payoutId).toBe(b.payoutId);
    expect(a.status).toBe('scheduled');
  });

  it('normalizes a webhook with a dedup key', () => {
    const evt = port.verifyAndNormalizeWebhook(
      { collectionId: 'fake-col-1', status: 'approved', eventId: 'evt-9' },
      'sig',
    );
    expect(evt).toEqual({
      eventId: 'evt-9',
      collectionId: 'fake-col-1',
      status: 'approved',
      dedupKey: 'evt-9',
    });
  });

  it('reports a collection status', async () => {
    expect(await port.getCollectionStatus('fake-col-1')).toBe('approved');
  });
});
