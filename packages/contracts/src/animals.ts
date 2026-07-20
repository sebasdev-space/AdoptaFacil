// Module: M03 animals · Contracts owner: @sebastian
//
// Contract-first: this is the STABLE public shape of an animal record (§9 M03,
// §14 entity Animal). It is published ahead of the M03 implementation so M04
// (adoptions, @fabian) and the public portal can build against it. Treat the
// base fields as stable; anything marked optional is additive-by-design so the
// shape can grow without breaking consumers. All timestamps are ISO-8601 UTC
// (Colombia local time is a presentation concern only).

/** Species. Stable set (perro / gato / otro). */
export type AnimalSpecies = 'dog' | 'cat' | 'other';

/** Sex (macho / hembra / desconocido). */
export type AnimalSex = 'male' | 'female' | 'unknown';

/** Size (pequeño / mediano / grande). */
export type AnimalSize = 'small' | 'medium' | 'large';

/**
 * Availability status of the animal's adoption record (§14):
 * - `available`   — disponible para adopción
 * - `in_process`  — con una solicitud/adopción en curso (en_proceso)
 * - `adopted`     — adoptado
 * - `unavailable` — no disponible (retirado, en tratamiento, fallecido, …)
 */
export type AnimalStatus = 'available' | 'in_process' | 'adopted' | 'unavailable';

/** Allowed values, exported for validation and UI (dropdowns/filters). */
export const ANIMAL_SPECIES: readonly AnimalSpecies[] = ['dog', 'cat', 'other'];
export const ANIMAL_SEXES: readonly AnimalSex[] = ['male', 'female', 'unknown'];
export const ANIMAL_SIZES: readonly AnimalSize[] = ['small', 'medium', 'large'];
export const ANIMAL_STATUSES: readonly AnimalStatus[] = [
  'available',
  'in_process',
  'adopted',
  'unavailable',
];

/**
 * An animal's record (expediente). The base fields are STABLE — M04 and the
 * portal may rely on them. Optional fields are part of the base model but not
 * guaranteed to be present on every record yet; they are declared now so adding
 * them later is non-breaking.
 */
export interface Animal {
  // --- Stable base -----------------------------------------------------------
  id: string;
  /** Owning organization (multi-tenant invariant — always present). */
  organizationId: string;
  name: string;
  species: AnimalSpecies;
  sex: AnimalSex;
  size: AnimalSize;
  status: AnimalStatus;
  /** Photo URLs; empty array when none. Ordered, first is the primary photo. */
  photos: string[];
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;

  // --- Optional / future base attributes (additive; may be absent) -----------
  /** Breed, or a free-text custom breed when not from a catalog (raza). */
  breed?: string;
  /** Date of birth, ISO-8601 (UTC). Preferred over `approximateAgeMonths`. */
  birthDate?: string;
  /** Approximate age in months, when the exact birth date is unknown. */
  approximateAgeMonths?: number;
  /** Free-text description (descripción). */
  description?: string;
}

/**
 * Minimal projection for lists and cards (M04 adoption flow, public portal).
 * Just enough to render an animal without its full record.
 */
export interface AnimalSummary {
  id: string;
  organizationId: string;
  name: string;
  species: AnimalSpecies;
  sex: AnimalSex;
  size: AnimalSize;
  status: AnimalStatus;
  /** Primary photo URL, if any. */
  photoUrl?: string;
}
