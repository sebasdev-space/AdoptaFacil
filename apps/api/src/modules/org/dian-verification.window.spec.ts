import {
  DIAN_VERIFICATION_MAX_ATTEMPTS,
  deriveDianAttemptOutcome,
  dianVerificationBackoffMs,
  isFinalDianAttempt,
} from './dian-verification.window';

describe('dian-verification.window', () => {
  it('5 total attempts: 1 initial + 4 staggered retries (RNF07)', () => {
    expect(DIAN_VERIFICATION_MAX_ATTEMPTS).toBe(5);
  });

  it('follows the RNF07 schedule: 5min → 30min → 2h → 24h (same 1-based mapping as reminders.window.ts, verified against its own test)', () => {
    expect(dianVerificationBackoffMs(1)).toBe(5 * 60_000);
    expect(dianVerificationBackoffMs(2)).toBe(30 * 60_000);
    expect(dianVerificationBackoffMs(3)).toBe(2 * 60 * 60_000);
    expect(dianVerificationBackoffMs(4)).toBe(24 * 60 * 60_000);
  });

  it('clamps to the last delay beyond the schedule', () => {
    expect(dianVerificationBackoffMs(9)).toBe(24 * 60 * 60_000);
  });

  it('isFinalDianAttempt is true only on the 5th attempt (attemptsMade=4)', () => {
    expect(isFinalDianAttempt(0)).toBe(false);
    expect(isFinalDianAttempt(1)).toBe(false);
    expect(isFinalDianAttempt(2)).toBe(false);
    expect(isFinalDianAttempt(3)).toBe(false);
    expect(isFinalDianAttempt(4)).toBe(true);
  });

  describe('deriveDianAttemptOutcome', () => {
    const now = new Date('2026-08-23T00:00:00.000Z');

    it('verified=true always yields "verified", regardless of attempt number', () => {
      expect(deriveDianAttemptOutcome(true, 0, now)).toEqual({
        status: 'verified',
        attemptNumber: 1,
        nextRetryAt: null,
      });
      expect(deriveDianAttemptOutcome(true, 3, now)).toMatchObject({ status: 'verified' });
    });

    it('a non-final failure yields "retrying" with the correct nextRetryAt (5min after the 1st failure)', () => {
      const outcome = deriveDianAttemptOutcome(false, 0, now);
      expect(outcome.status).toBe('retrying');
      expect(outcome.attemptNumber).toBe(1);
      expect(outcome.nextRetryAt).toEqual(new Date(now.getTime() + 5 * 60_000));
    });

    it('the 2nd failure schedules the 30min retry', () => {
      const outcome = deriveDianAttemptOutcome(false, 1, now);
      expect(outcome.attemptNumber).toBe(2);
      expect(outcome.nextRetryAt).toEqual(new Date(now.getTime() + 30 * 60_000));
    });

    it('the final failure (5th attempt) yields "failed" with no nextRetryAt', () => {
      const outcome = deriveDianAttemptOutcome(false, 4, now);
      expect(outcome).toEqual({ status: 'failed', attemptNumber: 5, nextRetryAt: null });
    });
  });
});
