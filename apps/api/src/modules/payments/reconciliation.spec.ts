import { computeReconciliationRow, type ReconciliationRawRow } from '@adoptafacil/contracts';

/**
 * `computeReconciliationRow` (F-5, M15b, RF26) — the SINGLE source of what
 * counts as "needs manual review" in the reconciliation report. Reused
 * verbatim by `ReconciliationService`; tested here directly (imported from
 * `@adoptafacil/contracts`, same convention as `payment-breakdown.spec.ts`)
 * with the edge cases the task calls out explicitly: partial amounts and a
 * failed dispersal.
 */
const base: ReconciliationRawRow = {
  organizationId: 'org-1',
  organizationName: 'Refugio Patitas',
  period: '2026-08',
  collected: 0,
  dispersedPaid: 0,
  dispersedScheduled: 0,
  dispersedFailed: 0,
};

describe('computeReconciliationRow (F-5, RF26)', () => {
  it('nothing collected, nothing dispersed: pending 0, never flagged', () => {
    const row = computeReconciliationRow(base);
    expect(row.pending).toBe(0);
    expect(row.flagged).toBe(false);
    expect(row.flagReason).toBeUndefined();
  });

  it('fully collected, nothing dispersed yet: pending = collected, NOT flagged (T+1 simply has not run yet)', () => {
    const row = computeReconciliationRow({ ...base, collected: 100_000 });
    expect(row.pending).toBe(100_000);
    expect(row.flagged).toBe(false);
  });

  it('partial dispersal (some paid, rest still pending): pending = collected - paid, not flagged', () => {
    const row = computeReconciliationRow({ ...base, collected: 100_000, dispersedPaid: 60_000 });
    expect(row.pending).toBe(40_000);
    expect(row.flagged).toBe(false);
  });

  it('fully reconciled (paid == collected): pending 0, not flagged', () => {
    const row = computeReconciliationRow({ ...base, collected: 100_000, dispersedPaid: 100_000 });
    expect(row.pending).toBe(0);
    expect(row.flagged).toBe(false);
  });

  it('overpaid (paid MORE than collected — a real anomaly): flagged, pending negative', () => {
    const row = computeReconciliationRow({ ...base, collected: 100_000, dispersedPaid: 150_000 });
    expect(row.pending).toBe(-50_000);
    expect(row.flagged).toBe(true);
    expect(row.flagReason).toBe('overpaid');
  });

  it('a failed dispersal attempt is flagged for review even when pending is still positive', () => {
    const row = computeReconciliationRow({
      ...base,
      collected: 100_000,
      dispersedPaid: 0,
      dispersedFailed: 100_000,
    });
    expect(row.pending).toBe(100_000);
    expect(row.flagged).toBe(true);
    expect(row.flagReason).toBe('failed_payout');
  });

  it('a scheduled (in-flight, unconfirmed) payout alone never flags and never counts toward pending', () => {
    const row = computeReconciliationRow({
      ...base,
      collected: 100_000,
      dispersedScheduled: 100_000,
    });
    expect(row.pending).toBe(100_000); // scheduled ≠ paid — still pending until the webhook confirms
    expect(row.flagged).toBe(false);
  });

  it('"overpaid" takes precedence when BOTH overpaid and a failed dispersal are present', () => {
    const row = computeReconciliationRow({
      ...base,
      collected: 100_000,
      dispersedPaid: 120_000,
      dispersedFailed: 5_000,
    });
    expect(row.flagged).toBe(true);
    expect(row.flagReason).toBe('overpaid');
  });

  it('preserves the identifying fields (organizationId, organizationName, period) verbatim', () => {
    const row = computeReconciliationRow(base);
    expect(row.organizationId).toBe('org-1');
    expect(row.organizationName).toBe('Refugio Patitas');
    expect(row.period).toBe('2026-08');
  });
});
