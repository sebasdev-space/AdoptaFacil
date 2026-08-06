import { z } from 'zod';
import { AnimalSex, AnimalSize, AnimalSpecies } from '@adoptafacil/contracts';
import { sex, size, species, tags } from './animals.schemas';

/**
 * Column headers of the bulk-import template (S2-04B-1), matched
 * case-insensitively/trimmed. `Nombre`/`Especie` are the only required ones —
 * every other column may be blank. There is deliberately NO "organización"
 * column: `organization_id` always comes from the uploader's JWT (§restricciones),
 * so even if a row includes a column pretending to set one, it's simply never
 * read here.
 */
export const BULK_IMPORT_HEADERS = [
  'Nombre',
  'Especie',
  'Raza',
  'Sexo',
  'Tamaño',
  'Fecha de nacimiento',
  'Descripción',
  'Etiquetas',
] as const;

/** Row-count ceiling (§restricciones — "sugerido 500", TODO(client) to confirm). */
export const BULK_IMPORT_MAX_ROWS = 500;

const SPECIES_LABELS: Record<string, AnimalSpecies> = {
  perro: 'dog',
  dog: 'dog',
  gato: 'cat',
  cat: 'cat',
  otro: 'other',
  other: 'other',
};

const SEX_LABELS: Record<string, AnimalSex> = {
  macho: 'male',
  male: 'male',
  hembra: 'female',
  female: 'female',
  desconocido: 'unknown',
  unknown: 'unknown',
  '': 'unknown',
};

// Keys are already ACCENT-STRIPPED (normalizeLabel runs NFD + strips combining
// diacritics before lookup) — 'pequeño' would never match, only 'pequeno' does.
const SIZE_LABELS: Record<string, AnimalSize> = {
  pequeno: 'small',
  small: 'small',
  mediano: 'medium',
  medium: 'medium',
  grande: 'large',
  large: 'large',
  '': 'medium',
};

/** Normalize a label cell for lookup: trim, lowercase, strip accents. */
const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Also used to match header cells against {@link BULK_IMPORT_HEADERS}. */
export function normalizeLabel(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '');
}

export function mapSpeciesLabel(value: unknown): AnimalSpecies | undefined {
  return SPECIES_LABELS[normalizeLabel(value)];
}

export function mapSexLabel(value: unknown): AnimalSex | undefined {
  return SEX_LABELS[normalizeLabel(value)];
}

export function mapSizeLabel(value: unknown): AnimalSize | undefined {
  return SIZE_LABELS[normalizeLabel(value)];
}

/** Split a free-text tags cell ("Juguetón, Cariñoso") into a clean list. */
export function parseTagsCell(value: unknown): string[] {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

/** A row after label→code mapping, ready for business validation. */
export const bulkImportRowSchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
    species,
    sex,
    size,
    breedName: z.string().trim().max(80).optional(),
    birthDate: z.string().datetime({ offset: true }).optional(),
    description: z.string().trim().max(5000).optional(),
    tags: tags.optional(),
  })
  .strict();

export type BulkImportRowInput = z.infer<typeof bulkImportRowSchema>;
