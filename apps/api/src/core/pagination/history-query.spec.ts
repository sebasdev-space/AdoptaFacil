import { HISTORY_ARRAY_CAP, HISTORY_DEFAULT_PAGE_SIZE } from '@adoptafacil/contracts';
import { createdAtFilter, historyQuerySchema, resolveHistoryWindow } from './history-query';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const schema = historyQuerySchema(['a', 'b'] as const);

describe('resolveHistoryWindow', () => {
  it('defaults to the last 30 days in capped array mode when nothing is given', () => {
    const w = resolveHistoryWindow({}, NOW);
    expect(w.paged).toBe(false);
    expect(w.gte?.toISOString()).toBe('2026-08-31T12:00:00.000Z');
    expect(w.lte).toBeUndefined();
    expect(w.take).toBe(HISTORY_ARRAY_CAP);
  });

  it('respects an explicit range without the 30-day default', () => {
    const w = resolveHistoryWindow({ from: '2026-01-01T00:00:00.000Z' }, NOW);
    expect(w.gte?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(w.paged).toBe(false);
  });

  it('page => paged mode over the full history (no implicit date limit)', () => {
    const w = resolveHistoryWindow({ page: 3 }, NOW);
    expect(w.paged).toBe(true);
    expect(createdAtFilter(w)).toBeUndefined();
    expect(w.take).toBe(HISTORY_DEFAULT_PAGE_SIZE);
    expect(w.skip).toBe(2 * HISTORY_DEFAULT_PAGE_SIZE);
  });

  it('honours pageSize and a range together with page', () => {
    const w = resolveHistoryWindow({ page: 2, pageSize: 10, to: '2026-02-01T00:00:00Z' }, NOW);
    expect(w).toMatchObject({ take: 10, skip: 10, paged: true });
    expect(createdAtFilter(w)).toEqual({ lte: new Date('2026-02-01T00:00:00Z') });
  });
});

describe('historyQuerySchema', () => {
  it('accepts an empty query and coerces numeric strings', () => {
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ page: '2', pageSize: '50' })).toEqual({ page: 2, pageSize: 50 });
  });

  it('rejects out-of-range pageSize, bad dates, unknown status/keys and inverted ranges', () => {
    expect(schema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(schema.safeParse({ page: '0' }).success).toBe(false);
    expect(schema.safeParse({ from: 'ayer' }).success).toBe(false);
    expect(schema.safeParse({ status: 'z' }).success).toBe(false);
    expect(schema.safeParse({ foo: 1 }).success).toBe(false);
    expect(
      schema.safeParse({ from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }).success,
    ).toBe(false);
  });
});
