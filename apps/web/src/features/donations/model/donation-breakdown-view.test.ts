import { describe, expect, it } from 'vitest';
import { computeBreakdown, MIN_DONATION_AMOUNT } from '@adoptafacil/contracts';
import {
  buildDonationBreakdown,
  formatCop,
  safeBuildDonationBreakdown,
} from './donation-breakdown-view';

/**
 * §M05 — the breakdown SHOWN to the donor must be, to the peso, `computeBreakdown`
 * (the single source of the money math). This test pins that equality in BOTH
 * commission modes across several amounts, so the UI can never drift into its own
 * arithmetic.
 */
const AMOUNTS = [1000, 5000, 33333, 50000, 100000, 1234567];

describe('donation-breakdown-view', () => {
  it('shows EXACTLY computeBreakdown in both commission modes (no own arithmetic)', () => {
    for (const amount of AMOUNTS) {
      for (const payer of ['organization', 'donor'] as const) {
        const { breakdown } = buildDonationBreakdown(amount, payer);
        expect(breakdown).toEqual(computeBreakdown(amount, payer));
      }
    }
  });

  it('lists the itemized lines whose amounts come straight from the breakdown', () => {
    const { breakdown, lines } = buildDonationBreakdown(50000, 'donor');
    for (const line of lines) {
      expect(line.amount).toBe(breakdown[line.key]);
    }
    // The emphasised lines are what the donor pays and what the org receives.
    expect(lines.find((l) => l.emphasis === 'charged')?.amount).toBe(breakdown.amountCharged);
    expect(lines.find((l) => l.emphasis === 'net')?.amount).toBe(breakdown.net);
  });

  it('org mode: total charged equals the intended amount; org absorbs the fees', () => {
    const { breakdown } = buildDonationBreakdown(50000, 'organization');
    expect(breakdown.amountCharged).toBe(50000);
    expect(breakdown.net).toBeLessThan(50000);
  });

  it('donor mode: total charged exceeds intended; the org nets ≈ the intended amount', () => {
    const { breakdown } = buildDonationBreakdown(50000, 'donor');
    expect(breakdown.amountCharged).toBeGreaterThan(50000);
    expect(Math.abs(breakdown.net - 50000)).toBeLessThanOrEqual(2);
  });

  it('safe variant returns null below the minimum / for non-integers, never throwing', () => {
    expect(safeBuildDonationBreakdown(MIN_DONATION_AMOUNT - 1, 'organization')).toBeNull();
    expect(safeBuildDonationBreakdown(1000.5, 'organization')).toBeNull();
    expect(safeBuildDonationBreakdown(Number.NaN, 'donor')).toBeNull();
    expect(safeBuildDonationBreakdown(MIN_DONATION_AMOUNT, 'organization')).not.toBeNull();
  });

  it('formats integer pesos in es-CO currency without decimals', () => {
    const out = formatCop(50000);
    expect(out).toMatch(/50\.000/);
    expect(out).not.toMatch(/,\d\d/);
  });
});
