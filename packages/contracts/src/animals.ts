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
  /** Breed, or a free-text custom breed when not from a catalog (raza). Kept
   *  populated (T-104) with the EFFECTIVE breed name — the catalog breed's name
   *  or `customBreed` — so legacy/portal consumers still get a string. */
  breed?: string;
  /** Date of birth, ISO-8601 (UTC). Preferred over `approximateAgeMonths`. */
  birthDate?: string;
  /** Approximate age in months, when the exact birth date is unknown. */
  approximateAgeMonths?: number;
  /** Free-text description (descripción). */
  description?: string;

  // --- M03 implementation enrichment (T-104, RF07, additive; may be absent) --
  /** Reference to a tenant breed-catalog entry (raza) when chosen from the org's
   *  list; `customBreed` is used otherwise. `breed` above stays the effective name. */
  breedId?: string;
  /** Free-text custom breed when not chosen from the catalog. */
  customBreed?: string;
  /** DERIVED age, computed in the API from `birthDate`/`approximateAgeMonths`.
   *  Never persisted; absent when the age is unknown. */
  computedAge?: ComputedAge;
  /** Soft-activation flag (RF07). `false` = deactivated/hidden; the record is
   *  NEVER physically deleted. Absent is treated as active by consumers. */
  isActive?: boolean;
  /** Full photo metadata (ref + order + resolved url). `photos` above stays the
   *  ordered URL list for legacy/portal consumers. */
  photoRecords?: AnimalPhoto[];
}

/**
 * A photo attached to an animal record (RF07). Only METADATA is persisted
 * (storage ref + order); the image bytes and the real compression live behind
 * the StoragePort adapter. `url` is resolved for presentation, not stored.
 */
export interface AnimalPhoto {
  id: string;
  /** Opaque storage key/ref (StoragePort) — never the image bytes. */
  storageRef: string;
  /** 0-based display order; the first is the primary photo. */
  order: number;
  /** Resolved public URL for display (derived, not persisted). */
  url: string;
}

/**
 * A tenant-scoped, user-EXTENSIBLE breed (raza). No closed catalog is imposed:
 * each organization builds its own list (the seed starts empty), and an operator
 * may create a custom breed and assign it.
 */
export interface AnimalBreed {
  id: string;
  organizationId: string;
  species: AnimalSpecies;
  name: string;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/**
 * DERIVED age of an animal (RF07), computed in the API from `birthDate`
 * (preferred) or `approximateAgeMonths`. NEVER persisted. Absent when the age is
 * unknown (no birth date and no approximate age).
 */
export interface ComputedAge {
  /** Whole years. */
  years: number;
  /** Remaining whole months after `years` (0–11). */
  months: number;
  /** Total age in whole months. */
  totalMonths: number;
  /** True when derived from an approximate age (unknown exact birth date). */
  approximate: boolean;
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
  /** Soft-activation flag (T-104). */
  isActive?: boolean;
}

// ============================================================================
// M03 write DTOs (T-104, RF07). Owner/Administrator/Operator/Veterinarian write;
// ReadOnlyAuditor may only read. All timestamps are ISO-8601 UTC.
// ============================================================================

/** Reserve a photo for an animal. Only metadata is stored; the client PUTs the
 *  bytes to the returned StoragePort target (compression is the adapter's job). */
export interface AnimalPhotoInput {
  filename: string;
  contentType?: string;
  /** Explicit 0-based order; defaults to appended at the end. */
  order?: number;
}

/** Create an animal record (expediente). At least one photo is expected (§10).
 *  `status` defaults to `available`; the record starts active. */
export interface CreateAnimalInput {
  name: string;
  species: AnimalSpecies;
  sex: AnimalSex;
  size: AnimalSize;
  status?: AnimalStatus;
  breedId?: string;
  customBreed?: string;
  /** ISO-8601 UTC date of birth (preferred for age). */
  birthDate?: string;
  /** Approximate age in months when the birth date is unknown. */
  approximateAgeMonths?: number;
  description?: string;
  photos?: AnimalPhotoInput[];
}

/** Patch an animal record. All fields optional; only provided fields change.
 *  Activation is toggled through the dedicated activate/deactivate actions. */
export interface UpdateAnimalInput {
  name?: string;
  species?: AnimalSpecies;
  sex?: AnimalSex;
  size?: AnimalSize;
  status?: AnimalStatus;
  breedId?: string;
  customBreed?: string;
  birthDate?: string;
  approximateAgeMonths?: number;
  description?: string;
}

/** Create a tenant-scoped custom breed (raza). */
export interface CreateAnimalBreedInput {
  species: AnimalSpecies;
  name: string;
}

/** Result of reserving an animal photo: the stored metadata + the simulable
 *  storage target the client PUTs the bytes to. */
export interface AnimalPhotoUploadResult {
  photo: AnimalPhoto;
  upload: {
    url: string;
    key: string;
  };
}

// ============================================================================
// M03 CLINICAL RECORD (T-105, RF08, §9/§10/§14, RNF05, Ley 1774). Additive.
// Typed clinical events with date(s), attachments, author and VERSIONING:
// editing creates a NEW immutable version and preserves earlier ones. Reminders
// for the next vaccine are NOT scheduled here (RF09/T-106) — only `nextDueDate`
// is persisted for T-106 to consume. All timestamps are ISO-8601 UTC.
// ============================================================================

/**
 * Clinical event type — the list from the base document (§10). EXTENSIBLE (add
 * members additively); this is NOT an invented catalog. Values are stable.
 */
export enum ClinicalEventType {
  Vaccine = 'vaccine',
  Treatment = 'treatment',
  Surgery = 'surgery',
  Sterilization = 'sterilization',
  Allergy = 'allergy',
  Disability = 'disability',
  Medication = 'medication',
  Diagnosis = 'diagnosis',
}

/** Attachment of a clinical event version (RF08). Only METADATA is persisted
 *  (storage ref + order); the bytes and real compression live behind the same
 *  animals StoragePort. `url` is resolved for presentation, not stored. */
export interface ClinicalAttachment {
  id: string;
  storageRef: string;
  order: number;
  url: string;
}

/** Free-form clinical detail. Kept OPEN on purpose (no invented medical schema;
 *  the concrete fields per type are a client/vet decision). NEVER written to the
 *  audit log in clear (Ley 1581/1774). */
export type ClinicalEventDetails = Record<string, unknown>;

/**
 * One VERSION of a clinical event (RF08). `eventId` groups all versions of the
 * same logical event; `version` is 1-based. Editing creates a new version (a new
 * row with the next `version`, a new `id`, and the editor as `authorUserId`) and
 * leaves earlier versions IMMUTABLE — each keeps its ORIGINAL author and time.
 * The current state of an event is its highest-`version` row.
 */
export interface ClinicalEvent {
  /** This version's unique id. */
  id: string;
  /** Logical event id shared by every version of this event. */
  eventId: string;
  organizationId: string;
  animalId: string;
  type: ClinicalEventType;
  /** When the clinical event occurred (UTC). */
  occurredAt: string;
  /** Next-due date for a follow-up (e.g. next vaccine). Persisted for T-106 to
   *  consume; NO reminder is scheduled here. */
  nextDueDate?: string;
  details: ClinicalEventDetails;
  /** 1-based version number. */
  version: number;
  /** User who authored THIS version. */
  authorUserId: string;
  attachments: ClinicalAttachment[];
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Reserve an attachment for a clinical event version (metadata only). */
export interface ClinicalAttachmentInput {
  filename: string;
  contentType?: string;
  order?: number;
}

/** Create a clinical event (version 1). Veterinarian only. */
export interface CreateClinicalEventInput {
  type: ClinicalEventType;
  /** ISO-8601 UTC. */
  occurredAt: string;
  /** ISO-8601 UTC (e.g. next vaccine). */
  nextDueDate?: string;
  details?: ClinicalEventDetails;
  attachments?: ClinicalAttachmentInput[];
}

/**
 * Edit a clinical event → creates the NEXT version. Provided fields override the
 * latest version; omitted fields carry forward. Any `attachments` here are added
 * on top of the carried-forward set. Veterinarian only.
 */
export interface EditClinicalEventInput {
  type?: ClinicalEventType;
  occurredAt?: string;
  nextDueDate?: string;
  details?: ClinicalEventDetails;
  attachments?: ClinicalAttachmentInput[];
}
