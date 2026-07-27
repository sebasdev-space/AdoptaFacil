import { type CommissionPayer, computeBreakdown } from '@adoptafacil/contracts';

/**
 * Smoke test of the money invariant (RNF12), REUSING the single source of the
 * commission math from contracts (computeBreakdown) — no reimplementation here.
 * Holds to the peso in both modes; all amounts are integer COP (no float).
 */
describe('computeBreakdown money invariant (T-052 smoke)', () => {
  const amounts = [1_000, 25_000, 100_000, 1_234_567];
  const modes: CommissionPayer[] = ['organization', 'donor'];

  for (const mode of modes) {
    for (const amount of amounts) {
      it(`sums to the peso and net<=gross (${mode}, ${amount})`, () => {
        const b = computeBreakdown(amount, mode);

        // gross === net + platformFee + platformIva + gatewayFee + gatewayIva
        expect(b.gross).toBe(b.net + b.platformFee + b.platformIva + b.gatewayFee + b.gatewayIva);
        expect(b.net).toBeLessThanOrEqual(b.gross);
        // Integer pesos only (never float).
        for (const value of Object.values(b)) {
          expect(Number.isInteger(value)).toBe(true);
        }
        // amountCharged equals gross in Ola 1 (no split/tips).
        expect(b.amountCharged).toBe(b.gross);
      });
    }
  }
});
