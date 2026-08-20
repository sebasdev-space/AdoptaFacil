import { PAYOUT_MAX_ATTEMPTS, payoutBackoffMs } from './payouts.window';

describe('payoutBackoffMs (M15b, RF26 — staggered retry)', () => {
  it('returns the first delay for the first attempt (0 or negative)', () => {
    expect(payoutBackoffMs(0)).toBe(5 * 60_000);
    expect(payoutBackoffMs(-1)).toBe(5 * 60_000);
  });

  it('follows the 5min → 30min → 2h → 24h schedule', () => {
    expect(payoutBackoffMs(1)).toBe(5 * 60_000);
    expect(payoutBackoffMs(2)).toBe(30 * 60_000);
    expect(payoutBackoffMs(3)).toBe(2 * 60 * 60_000);
    expect(payoutBackoffMs(4)).toBe(24 * 60 * 60_000);
  });

  it('clamps to the last delay beyond the schedule', () => {
    expect(payoutBackoffMs(5)).toBe(24 * 60 * 60_000);
    expect(payoutBackoffMs(100)).toBe(24 * 60 * 60_000);
  });

  it('PAYOUT_MAX_ATTEMPTS is 1 initial + 4 staggered retries', () => {
    expect(PAYOUT_MAX_ATTEMPTS).toBe(5);
  });
});
