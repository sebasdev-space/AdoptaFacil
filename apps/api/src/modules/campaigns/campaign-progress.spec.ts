import { computeProgress } from './campaign-progress';

describe('computeProgress (RF15)', () => {
  it('is 0 when nothing is raised', () => {
    expect(computeProgress(0, 100_000)).toBe(0);
  });
  it('is the raised/goal ratio', () => {
    expect(computeProgress(50_000, 100_000)).toBe(0.5);
    expect(computeProgress(100_000, 100_000)).toBe(1);
  });
  it('clamps above the goal to 1', () => {
    expect(computeProgress(150_000, 100_000)).toBe(1);
  });
  it('rounds to 4 decimals', () => {
    expect(computeProgress(1, 3)).toBe(0.3333);
  });
  it('guards a non-positive goal (returns 0)', () => {
    expect(computeProgress(100, 0)).toBe(0);
  });
});
