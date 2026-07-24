import { describe, expect, it } from 'vitest';
import { ADOPTION_STATUSES } from '@adoptafacil/contracts';
import {
  ADOPTION_COLUMNS,
  ADOPTION_NEXT_STATUSES,
  ADOPTION_STATUS_LABELS,
  adoptionStatusVariant,
  formatBogota,
} from './adoptions-view';

describe('adoptions-view model', () => {
  it('has a column and a label for every contract status', () => {
    expect([...ADOPTION_COLUMNS].sort()).toEqual([...ADOPTION_STATUSES].sort());
    for (const status of ADOPTION_STATUSES) {
      expect(ADOPTION_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('offers only forward transitions; terminal states offer none', () => {
    expect(ADOPTION_NEXT_STATUSES.new).toEqual(['in_review']);
    expect(ADOPTION_NEXT_STATUSES.in_review).toEqual(['approved', 'rejected']);
    expect(ADOPTION_NEXT_STATUSES.approved).toEqual([]);
    expect(ADOPTION_NEXT_STATUSES.rejected).toEqual([]);
  });

  it('maps each status to a semantic badge variant', () => {
    expect(adoptionStatusVariant('approved')).toBe('success');
    expect(adoptionStatusVariant('rejected')).toBe('destructive');
    expect(adoptionStatusVariant('in_review')).toBe('info');
    expect(adoptionStatusVariant('new')).toBe('outline');
  });

  it('formats a UTC timestamp in Colombia time and passes through invalid input', () => {
    const out = formatBogota('2026-07-24T15:00:00.000Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(formatBogota('not-a-date')).toBe('not-a-date');
  });
});
