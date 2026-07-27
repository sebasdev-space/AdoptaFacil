/**
 * Accountability math (RF16 · T-054). Pure and framework-free so it is trivial
 * to unit-test. The report's "total spent" is the SUM of the DECLARED amounts of
 * the (non-deleted) evidences — nothing more. It is NOT related to how much was
 * raised (raised stays 0 until T-055), so this never implies an "executed %".
 * Amounts are integer COP pesos; evidences without an amount (e.g. photos)
 * contribute 0.
 */
export function sumDeclaredSpending(evidences: ReadonlyArray<{ amount?: number | null }>): number {
  return evidences.reduce((total, evidence) => total + (evidence.amount ?? 0), 0);
}
