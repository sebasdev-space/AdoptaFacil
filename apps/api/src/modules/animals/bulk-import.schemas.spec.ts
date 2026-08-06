import {
  bulkImportRowSchema,
  mapSexLabel,
  mapSizeLabel,
  mapSpeciesLabel,
  normalizeLabel,
  parseTagsCell,
} from './bulk-import.schemas';

describe('bulk-import label mapping (S2-04B-1)', () => {
  it('maps species labels in Spanish and English, case/accent-insensitive', () => {
    expect(mapSpeciesLabel('Perro')).toBe('dog');
    expect(mapSpeciesLabel('  gato ')).toBe('cat');
    expect(mapSpeciesLabel('OTRO')).toBe('other');
    expect(mapSpeciesLabel('dog')).toBe('dog');
    expect(mapSpeciesLabel('dragón')).toBeUndefined();
    expect(mapSpeciesLabel(undefined)).toBeUndefined();
  });

  it('maps sex labels, defaulting blank to unknown', () => {
    expect(mapSexLabel('Macho')).toBe('male');
    expect(mapSexLabel('Hembra')).toBe('female');
    expect(mapSexLabel('')).toBe('unknown');
    expect(mapSexLabel(undefined)).toBe('unknown');
    expect(mapSexLabel('gibberish')).toBeUndefined();
  });

  it('maps size labels (with/without accent), defaulting blank to medium', () => {
    expect(mapSizeLabel('Pequeño')).toBe('small');
    expect(mapSizeLabel('Pequeno')).toBe('small');
    expect(mapSizeLabel('Grande')).toBe('large');
    expect(mapSizeLabel('')).toBe('medium');
  });

  it('normalizeLabel strips accents/case/whitespace for matching', () => {
    expect(normalizeLabel(' Tamaño ')).toBe('tamano');
    expect(normalizeLabel('DESCRIPCIÓN')).toBe('descripcion');
  });

  it('parses a comma/semicolon-separated tags cell, deduped and trimmed', () => {
    expect(parseTagsCell('Juguetón, Cariñoso ; Tímido')).toEqual([
      'Juguetón',
      'Cariñoso',
      'Tímido',
    ]);
    expect(parseTagsCell('Leal, Leal')).toEqual(['Leal']);
    expect(parseTagsCell(undefined)).toEqual([]);
    expect(parseTagsCell('')).toEqual([]);
  });
});

describe('bulkImportRowSchema (row-level validation)', () => {
  const valid = { name: 'Firulais', species: 'dog', sex: 'male', size: 'medium' };

  it('accepts a minimal valid row', () => {
    expect(bulkImportRowSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a missing/blank name', () => {
    expect(bulkImportRowSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects an unrecognized species code (post-mapping)', () => {
    expect(bulkImportRowSchema.safeParse({ ...valid, species: 'dragon' }).success).toBe(false);
  });

  it('accepts optional breedName/birthDate/description/tags', () => {
    const parsed = bulkImportRowSchema.safeParse({
      ...valid,
      breedName: 'Labrador Retriever',
      birthDate: new Date('2023-01-01').toISOString(),
      description: 'Muy sociable',
      tags: ['Juguetón'],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects more than 10 tags', () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
    expect(bulkImportRowSchema.safeParse({ ...valid, tags: tooMany }).success).toBe(false);
  });
});
