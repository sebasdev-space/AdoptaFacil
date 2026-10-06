import {
  createAttachmentUploadSchema,
  createClinicalEventSchema,
  editClinicalEventSchema,
} from './clinical.schemas';

describe('clinical event validation (RF08)', () => {
  const validVaccine = {
    type: 'vaccine',
    occurredAt: '2026-07-01T00:00:00.000Z',
    nextDueDate: '2027-07-01T00:00:00.000Z',
    details: { vaccine: 'rabia' },
    attachments: [{ storageRef: 'private/org-1/uuid-carnet.pdf' }],
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

  it('rejects an attachment with the OLD filename-only shape (fix, T-ANIMALS-ATTACHMENTS-AUDIT)', () => {
    expect(
      createClinicalEventSchema.safeParse({
        type: 'vaccine',
        occurredAt: '2026-07-01T00:00:00.000Z',
        attachments: [{ filename: 'carnet.pdf', contentType: 'application/pdf' }],
      }).success,
    ).toBe(false);
  });
});

describe('createAttachmentUploadSchema (fix, T-ANIMALS-ATTACHMENTS-AUDIT)', () => {
  it('accepts a filename with an optional content type', () => {
    expect(
      createAttachmentUploadSchema.safeParse({
        filename: 'examen.pdf',
        contentType: 'application/pdf',
      }).success,
    ).toBe(true);
    expect(createAttachmentUploadSchema.safeParse({ filename: 'examen.pdf' }).success).toBe(true);
  });

  it('rejects an empty filename', () => {
    expect(createAttachmentUploadSchema.safeParse({ filename: '' }).success).toBe(false);
  });
});
