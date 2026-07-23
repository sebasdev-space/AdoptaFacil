import { createAnimalSchema, createBreedSchema, updateAnimalSchema } from './animals.schemas';

describe('animal attribute validation (RF07)', () => {
  const valid = { name: 'Firulais', species: 'dog', sex: 'male', size: 'medium' };

  it('accepts a minimal valid animal', () => {
    expect(createAnimalSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a name', () => {
    expect(createAnimalSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects an unknown species', () => {
    expect(createAnimalSchema.safeParse({ ...valid, species: 'dragon' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(createAnimalSchema.safeParse({ ...valid, isActive: false }).success).toBe(false);
  });

  it('rejects a negative approximate age', () => {
    expect(createAnimalSchema.safeParse({ ...valid, approximateAgeMonths: -1 }).success).toBe(
      false,
    );
  });

  it('accepts an optional set of photos', () => {
    const parsed = createAnimalSchema.safeParse({
      ...valid,
      photos: [{ filename: 'a.jpg' }, { filename: 'b.jpg', order: 1 }],
    });
    expect(parsed.success).toBe(true);
  });

  it('update requires at least one field', () => {
    expect(updateAnimalSchema.safeParse({}).success).toBe(false);
    expect(updateAnimalSchema.safeParse({ status: 'adopted' }).success).toBe(true);
  });

  it('validates a breed', () => {
    expect(createBreedSchema.safeParse({ species: 'cat', name: 'Criollo' }).success).toBe(true);
    expect(createBreedSchema.safeParse({ species: 'cat', name: '' }).success).toBe(false);
  });
});
