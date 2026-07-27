import { sumDeclaredSpending } from './campaign-accountability';

describe('sumDeclaredSpending (T-054)', () => {
  it('sums the declared amounts (integer COP)', () => {
    expect(sumDeclaredSpending([{ amount: 120_000 }, { amount: 30_000 }, { amount: 500 }])).toBe(
      150_500,
    );
  });

  it('treats missing/null amounts (e.g. photos) as 0', () => {
    expect(sumDeclaredSpending([{ amount: 50_000 }, { amount: undefined }, { amount: null }])).toBe(
      50_000,
    );
  });

  it('is 0 for an empty list', () => {
    expect(sumDeclaredSpending([])).toBe(0);
  });
});
