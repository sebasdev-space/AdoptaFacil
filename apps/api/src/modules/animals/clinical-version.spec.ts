import { ClinicalEventType } from '@adoptafacil/contracts';
import { buildNextVersion, type ClinicalVersionState } from './clinical-version';

const prev: ClinicalVersionState = {
  type: ClinicalEventType.Vaccine,
  occurredAt: new Date('2026-07-01T00:00:00.000Z'),
  nextDueDate: new Date('2027-07-01T00:00:00.000Z'),
  details: { vaccine: 'rabia', lote: 'A1' },
  version: 1,
};

describe('buildNextVersion (RF08 versioning)', () => {
  it('increments the version number', () => {
    expect(buildNextVersion(prev, {}).version).toBe(2);
  });

  it('carries forward omitted fields', () => {
    const next = buildNextVersion(prev, {});
    expect(next.type).toBe(ClinicalEventType.Vaccine);
    expect(next.occurredAt).toEqual(prev.occurredAt);
    expect(next.nextDueDate).toEqual(prev.nextDueDate);
    expect(next.details).toEqual(prev.details);
  });

  it('overrides provided fields', () => {
    const next = buildNextVersion(prev, {
      occurredAt: new Date('2026-08-01T00:00:00.000Z'),
      nextDueDate: new Date('2027-08-01T00:00:00.000Z'),
      details: { vaccine: 'rabia', refuerzo: true },
    });
    expect(next.occurredAt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(next.nextDueDate?.toISOString()).toBe('2027-08-01T00:00:00.000Z');
    expect(next.details).toEqual({ vaccine: 'rabia', refuerzo: true });
  });

  it('does NOT mutate the previous version (earlier version stays intact)', () => {
    const snapshot = JSON.parse(JSON.stringify(prev));
    buildNextVersion(prev, { details: { changed: true }, version: undefined } as never);
    expect(JSON.parse(JSON.stringify(prev))).toEqual(snapshot);
    expect(prev.version).toBe(1);
  });
});
