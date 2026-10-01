import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY_FILTERS,
  bogotaDayEndToUtc,
  bogotaDayStartToUtc,
  historyQueryString,
  normalizeHistoryPage,
} from './history-controls';

describe('history-controls helpers', () => {
  it('converts Colombia calendar days to UTC bounds (UTC-5)', () => {
    expect(bogotaDayStartToUtc('2026-03-01')).toBe('2026-03-01T05:00:00.000Z');
    expect(bogotaDayEndToUtc('2026-03-01')).toBe('2026-03-02T04:59:59.999Z');
  });

  it('builds the paged query string with only the set filters', () => {
    expect(historyQueryString(EMPTY_HISTORY_FILTERS)).toBe('?page=1&pageSize=25');
    const qs = historyQueryString({
      from: '2026-03-01',
      to: '',
      status: 'approved',
      page: 2,
    });
    expect(qs).toContain('from=2026-03-01T05%3A00%3A00.000Z');
    expect(qs).toContain('status=approved');
    expect(qs).toContain('page=2');
    expect(qs).not.toContain('to=');
  });

  it('normalizes envelope, plain array and garbage', () => {
    expect(normalizeHistoryPage({ items: [1, 2], total: 9 })).toEqual({ items: [1, 2], total: 9 });
    expect(normalizeHistoryPage([1])).toEqual({ items: [1], total: 1 });
    expect(normalizeHistoryPage(null)).toEqual({ items: [], total: 0 });
  });
});
