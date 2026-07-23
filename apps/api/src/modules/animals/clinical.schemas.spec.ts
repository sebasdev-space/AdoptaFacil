import { createClinicalEventSchema, editClinicalEventSchema } from './clinical.schemas';

describe('clinical event validation (RF08)', () => {
  const validVaccine = {
    type: 'vaccine',
    occurredAt: '2026-07-01T00:00:00.000Z',
    nextDueDate: '2027-07-01T00:00:00.000Z',
    details: { vaccine: 'rabia' },
    attachments: [{ filename: 'carnet.pdf', contentType: 'application/pdf' }],
  };

  it('accepts a valid vaccine event with nextDueDate + attachment', () => {
    const parsed = createClinicalEventSchema.safeParse(validVaccine);
    expect(parsed.success).toBe(true);
  });

  it('accepts each documented event type', () => {
    for (const type of [
      'vaccine',
      'treatment',
      'surgery',
      'sterilization',
      'allergy',
      'disability',
      'medication',
      'diagnosis',
    ]) {
      expect(
        createClinicalEventSchema.safeParse({ type, occurredAt: '2026-07-01T00:00:00.000Z' })
          .success,
      ).toBe(true);
    }
  });

  it('rejects an unknown event type', () => {
    expect(
      createClinicalEventSchema.safeParse({
        type: 'ritual',
        occurredAt: '2026-07-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('requires a valid occurredAt', () => {
    expect(createClinicalEventSchema.safeParse({ type: 'vaccine' }).success).toBe(false);
    expect(
      createClinicalEventSchema.safeParse({ type: 'vaccine', occurredAt: 'not-a-date' }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(createClinicalEventSchema.safeParse({ ...validVaccine, foo: 1 }).success).toBe(false);
  });

  it('edit requires at least one field', () => {
    expect(editClinicalEventSchema.safeParse({}).success).toBe(false);
    expect(
      editClinicalEventSchema.safeParse({ nextDueDate: '2028-01-01T00:00:00.000Z' }).success,
    ).toBe(true);
  });
});
