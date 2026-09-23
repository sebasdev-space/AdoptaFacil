import { describe, expect, it } from 'vitest';
import {
  ageBucket,
  ageLabel,
  isRecentlyPublished,
  matchesSearch,
  sortAnimals,
} from './animals-catalog';
import type { AnimalSummary } from '@adoptafacil/contracts';

describe('ageLabel (T-D02)', () => {
  it('formats years and months from the DERIVED computedAge', () => {
    expect(ageLabel({ years: 2, months: 3, totalMonths: 27, approximate: false })).toBe(
      '2 años 3 m',
    );
    expect(ageLabel({ years: 1, months: 0, totalMonths: 12, approximate: false })).toBe('1 año');
    expect(ageLabel({ years: 0, months: 6, totalMonths: 6, approximate: false })).toBe('6 m');
  });

  it('marks an approximate age with a leading ~', () => {
    expect(ageLabel({ years: 3, months: 0, totalMonths: 36, approximate: true })).toBe('~3 años');
  });

  it('is undefined (never fabricated) when the animal has no computed age', () => {
    expect(ageLabel(undefined)).toBeUndefined();
  });

  it('falls back to "< 1 mes" for a newborn (0 years, 0 months)', () => {
    expect(ageLabel({ years: 0, months: 0, totalMonths: 0, approximate: false })).toBe('< 1 mes');
  });
});

function animal(id: string, name: string, over: Partial<AnimalSummary> = {}): AnimalSummary {
  return {
    id,
    organizationId: 'org-1',
    name,
    species: 'dog',
    sex: 'male',
    size: 'medium',
    status: 'available',
    ...over,
  };
}

describe('isRecentlyPublished (T-D03, insignia "Nuevo")', () => {
  const now = new Date('2026-09-23T00:00:00.000Z');

  it('is true within the 14-day window', () => {
    expect(isRecentlyPublished('2026-09-15T00:00:00.000Z', now)).toBe(true);
  });

  it('is false outside the window', () => {
    expect(isRecentlyPublished('2026-08-01T00:00:00.000Z', now)).toBe(false);
  });

  it('is false (never fabricated) when createdAt is absent or invalid', () => {
    expect(isRecentlyPublished(undefined, now)).toBe(false);
    expect(isRecentlyPublished('not-a-date', now)).toBe(false);
  });
});

describe('ageBucket (T-D03, filtro de edad)', () => {
  it('classifies young/adult/senior from computedAge.totalMonths', () => {
    expect(ageBucket({ years: 0, months: 6, totalMonths: 6, approximate: false })).toBe('young');
    expect(ageBucket({ years: 3, months: 0, totalMonths: 36, approximate: false })).toBe('adult');
    expect(ageBucket({ years: 8, months: 0, totalMonths: 96, approximate: false })).toBe('senior');
  });

  it('is undefined (never fabricated) without a computed age', () => {
    expect(ageBucket(undefined)).toBeUndefined();
  });
});

describe('matchesSearch (T-D03, búsqueda en tiempo real)', () => {
  it('matches by name or breed, case-insensitive', () => {
    const a = animal('a1', 'Firulais', { breed: 'Criollo' });
    expect(matchesSearch(a, 'firu')).toBe(true);
    expect(matchesSearch(a, 'CRIOLLO')).toBe(true);
    expect(matchesSearch(a, 'michi')).toBe(false);
  });

  it('an empty query matches everything', () => {
    expect(matchesSearch(animal('a1', 'Firulais'), '')).toBe(true);
  });

  it('never throws for an animal without a breed', () => {
    expect(matchesSearch(animal('a1', 'Firulais'), 'x')).toBe(false);
  });
});

describe('sortAnimals (T-D03)', () => {
  const items = [
    animal('a1', 'Zeus', { createdAt: '2026-09-01T00:00:00.000Z' }),
    animal('a2', 'Ana', { createdAt: '2026-09-10T00:00:00.000Z' }),
  ];

  it('sorts by name without mutating the input array', () => {
    const sorted = sortAnimals(items, 'name');
    expect(sorted.map((a) => a.name)).toEqual(['Ana', 'Zeus']);
    expect(items.map((a) => a.name)).toEqual(['Zeus', 'Ana']);
  });

  it('sorts by most/least recent using createdAt', () => {
    expect(sortAnimals(items, 'recent').map((a) => a.name)).toEqual(['Ana', 'Zeus']);
    expect(sortAnimals(items, 'oldest').map((a) => a.name)).toEqual(['Zeus', 'Ana']);
  });
});
