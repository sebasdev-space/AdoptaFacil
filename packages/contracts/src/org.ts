// Module: org · Contracts owner: @sebastian
//
// Tenant foundation contracts (RF §14 multi-tenant, RNF03). All timestamps are
// ISO-8601 strings in UTC — Colombia local time is a presentation concern only.

/**
 * A tenant organization: the platform-level account that owns every piece of
 * business data. Mirrors the `organizations` registry table (which is itself
 * NOT under RLS — it is the global catalog every business table references).
 *
 * ENRICHMENT NOTE (T-101b, M01/§14): the four base fields below are STABLE and
 * in use since Ola 0 (consumed by core/auth) — they are never changed. Every
 * profile/formalization field added afterwards is OPTIONAL and additive, so
 * existing records and consumers keep working.
 */
export interface Organization {
  // --- Stable base (Ola 0 — do NOT change) -----------------------------------
  id: string;
  name: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;

  // --- Institutional profile (M01, additive — all optional) ------------------
  /** Colombian tax id (NIT). */
  nit?: string;
  /** Legal/registered name (razón social), when it differs from `name`. */
  legalName?: string;
  description?: string;
  logoUrl?: string;
  /** Cover/banner photo URLs for the public portal. */
  coverPhotos?: string[];
  /** Contact channels. */
  whatsapp?: string;
  contactEmail?: string;
  phone?: string;
  location?: OrganizationLocation;
  socialLinks?: OrganizationSocialLinks;

  // --- Public portal (M14, additive) -----------------------------------------
  /** Subdomain for the org portal, e.g. `patitaspeludas` in
   *  patitaspeludas.adoptafacil.com. */
  subdomain?: string;
  /** URL slug for the path-based portal route `/o/<slug>`. */
  slug?: string;

  // --- Formalization & verification (M01/§14, additive) ----------------------
  formalizationState?: FormalizationState;
  /** Whether the ESAL's RTE (Régimen Tributario Especial) registration is
   *  current — relevant for tax-deductible donations. */
  rteVigente?: boolean;
  verificationLevel?: VerificationLevel;
}

/**
 * Per-request tenant context. Carries the organization whose rows the request
 * is allowed to touch. It is resolved once per request and pushed into an
 * async-local store; the database enforces it as a second barrier via RLS
 * (`app.current_org_id`). A request with no valid context has no `TenantContext`
 * at all, and business queries then return zero rows / are rejected.
 */
export interface TenantContext {
  organizationId: string;
}

/** Role a member holds within an organization. */
export type OrgMemberRole = 'owner' | 'admin' | 'member';

/**
 * A member of an organization — the first REAL business entity protected by
 * Row-Level Security. Carries `organizationId` and lives in a table with RLS
 * ENABLEd + FORCEd, so it is only ever visible inside its own tenant context.
 */
export interface OrgMember {
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  role: OrgMemberRole;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

// ============================================================================
// M01 organization profile & formalization (T-101b, §14). Contract-first,
// additive: published ahead of the M01 implementation for the public portal
// (M14, @fabian). Types only — no logic.
// ============================================================================

/** Physical location of the organization. All parts optional. */
export interface OrganizationLocation {
  country?: string;
  department?: string;
  city?: string;
  address?: string;
}

/** Social / web presence links. */
export interface OrganizationSocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
}

/**
 * Formalization state of an organization (§14). Uses the DOCUMENT-BASE names
 * (not wireframe labels). String values are stable — do not rename.
 * - `Informal`     — sin formalizar
 * - `EnProceso`    — formalización en curso
 * - `Formalizada`  — formalizada (persona jurídica)
 * - `ESAL`         — Entidad Sin Ánimo de Lucro
 * - `ESAL_RTE`     — ESAL en Régimen Tributario Especial (donaciones deducibles)
 */
export enum FormalizationState {
  Informal = 'informal',
  EnProceso = 'en_proceso',
  Formalizada = 'formalizada',
  ESAL = 'esal',
  ESAL_RTE = 'esal_rte',
}

/**
 * Ordered formalization sequence (RF02): Informal → EnProceso → Formalizada →
 * ESAL → ESAL_RTE. The state machine advances one step forward along this order
 * (and, by team decision, one step back with a reason). Adjacency is defined by
 * this array's indices.
 */
export const FORMALIZATION_SEQUENCE: readonly FormalizationState[] = [
  FormalizationState.Informal,
  FormalizationState.EnProceso,
  FormalizationState.Formalizada,
  FormalizationState.ESAL,
  FormalizationState.ESAL_RTE,
];

/** Current formalization status of an organization. */
export interface FormalizationStatus {
  state: FormalizationState;
  /** True iff `state === ESAL_RTE` (RTE registration current). */
  rteVigente: boolean;
}

/**
 * One entry of the append-only formalization history: who moved the org from
 * `fromState` to `toState`, when (UTC), and why. Immutable once written.
 */
export interface FormalizationTransition {
  id: string;
  organizationId: string;
  fromState: FormalizationState;
  toState: FormalizationState;
  actorUserId: string | null;
  reason: string | null;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Request to move the organization to `targetState`. `reason` is required for a
 *  backward move (and recommended for any transition). */
export interface RequestFormalizationTransitionInput {
  targetState: FormalizationState;
  reason?: string;
}

/**
 * Verification tier of an organization (§14): a numeric level plus the criteria
 * met to reach it. The concrete tiers/criteria are defined by M01; this is the
 * stable shape consumers render (e.g. a "verified" badge on the portal).
 */
export interface VerificationLevel {
  /** Numeric tier, higher = more verified (e.g. 0 = none). */
  level: number;
  /** Optional human-readable label of the tier. */
  label?: string;
  /** Criteria satisfied to reach this level. */
  criteria: string[];
  // --- T-103 enrichment (additive, optional) ---------------------------------
  /** The next tier's numeric level, if the ladder has one above `level`. */
  nextLevel?: number;
  /** Document types still required for the next tier (missing OR expired) — the
   *  reason the org is not yet at `nextLevel`. Empty at the top of the ladder. */
  blockedBy?: string[];
}

/**
 * Public-facing projection of an organization for the portal (M14). Excludes
 * sensitive/internal fields (NIT, legal name, phone, audit timestamps); exposes
 * only what a visitor/donor sees. All enrichment fields remain optional.
 */
export interface OrganizationPublic {
  id: string;
  name: string;
  slug?: string;
  subdomain?: string;
  description?: string;
  logoUrl?: string;
  coverPhotos?: string[];
  location?: OrganizationLocation;
  socialLinks?: OrganizationSocialLinks;
  whatsapp?: string;
  contactEmail?: string;
  formalizationState?: FormalizationState;
  rteVigente?: boolean;
  verificationLevel?: VerificationLevel;
  /**
   * NIT — public transparency datum for formalized ESALs in Colombia (team
   * decision, T-101). Exposed ONLY once the organization is formalized
   * (Formalizada or higher); omitted otherwise. Never `phone`/`legalName`
   * (legalName public exposure is still TODO pending client definition).
   */
  nit?: string;
}

/** Minimal projection for organization directory lists/cards on the portal. */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug?: string;
  logoUrl?: string;
  city?: string;
  verificationLevel?: VerificationLevel;
}

/**
 * Editable profile fields (M01 CRUD). Owner/Administrator only. All optional —
 * a partial update patches just the provided fields. Formalization/verification
 * fields are intentionally excluded here: `formalizationState` defaults to
 * `Informal` and is driven by the M01 state machine (T-102), not free edits.
 */
export interface UpdateOrganizationProfileInput {
  /** Organization display name (on the organizations registry). */
  name?: string;
  nit?: string;
  legalName?: string;
  description?: string;
  logoUrl?: string;
  coverPhotos?: string[];
  whatsapp?: string;
  contactEmail?: string;
  phone?: string;
  location?: OrganizationLocation;
  socialLinks?: OrganizationSocialLinks;
  subdomain?: string;
  slug?: string;
}

// ============================================================================
// M01 organization DOCUMENTS & verification review (T-103, §9/§10/§14, RNF05).
// Additive: documentary management with versioning + expiry, a platform review
// flow (observe/approve/reject with a mandatory reason), and verification levels
// COMPUTED from approved & current documents. All timestamps are ISO-8601 UTC.
// ============================================================================

/**
 * Lifecycle status of an organization document version. Stored statuses move
 * `Pending → (UnderReview) → Observed | Approved | Rejected`. `Expired` is a
 * COMPUTED status (never stored): an `Approved` document whose `expiresAt` is in
 * the past is presented as `Expired` and stops counting toward any verification
 * level until a new, current version is approved. Values are stable — do not rename.
 */
export enum DocumentStatus {
  Pending = 'pending',
  UnderReview = 'under_review',
  Observed = 'observed',
  Approved = 'approved',
  Rejected = 'rejected',
  Expired = 'expired',
}

/**
 * Type/category of an organization document. PARAMETRIZABLE — TODO(client): the
 * authoritative catalog (§9/§10) is a business decision the base document does
 * NOT fix. This is a MINIMAL, EXTENSIBLE starter set; add members additively as
 * the client confirms them. WHICH types (if any) gate a verification level or a
 * formalization step is a SEPARATE parametrizable decision (see the API's
 * verification/transition config), intentionally left unset so no requirement
 * is invented here.
 */
export enum DocumentType {
  ExistenceRepresentationCertificate = 'existence_representation_certificate',
  Rut = 'rut',
  LegalRepresentativeId = 'legal_representative_id',
  Other = 'other',
}

/**
 * One versioned organization document. A new upload of the same `type` gets the
 * next `version`; older versions are NEVER overwritten (the history is kept).
 * Review metadata is immutable once the version is decided.
 */
export interface OrganizationDocument {
  id: string;
  organizationId: string;
  type: DocumentType;
  /** Opaque storage key/ref (StoragePort) — never the document bytes. */
  storageRef: string;
  /** 1-based version number, unique per (organization, type). */
  version: number;
  /** When the document was issued (UTC), if known. */
  issuedAt?: string;
  /** Expiry instant (UTC), if the document expires. Past ⇒ Expired on read. */
  expiresAt?: string;
  /** Effective status (may be `Expired`, which is computed from `expiresAt`). */
  status: DocumentStatus;
  /** Reviewer note (motivo) — REQUIRED for `Observed`/`Rejected`. */
  reviewNote?: string;
  reviewedByUserId?: string;
  /** ISO-8601 UTC. */
  reviewedAt?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/** Upload a new document version (Owner/Administrator). The server assigns the
 *  next `version` for the (org, type) and sets status `Pending`. */
export interface UploadOrganizationDocumentInput {
  type: DocumentType;
  filename: string;
  contentType?: string;
  /** ISO-8601 UTC. */
  issuedAt?: string;
  /** ISO-8601 UTC. */
  expiresAt?: string;
}

/** Result of an upload: the created document + a simulable storage target the
 *  client PUTs the bytes to (StoragePort seam). */
export interface UploadOrganizationDocumentResult {
  document: OrganizationDocument;
  upload: {
    url: string;
    key: string;
  };
}

/** Platform reviewer decision verb. */
export type DocumentReviewDecision = 'observe' | 'approve' | 'reject';

/** A platform reviewer's decision on a document version. `note` (motivo) is
 *  REQUIRED for `observe` and `reject` (the API rejects with 400 otherwise). */
export interface ReviewOrganizationDocumentInput {
  decision: DocumentReviewDecision;
  note?: string;
}

/** One entry of the cross-tenant platform review queue (Pending/UnderReview
 *  documents across organizations). Exposes ONLY what the reviewer needs — never
 *  private org data. Served through a bounded SECURITY DEFINER function. */
export interface DocumentReviewQueueItem {
  id: string;
  organizationId: string;
  organizationName: string;
  type: DocumentType;
  version: number;
  status: DocumentStatus;
  storageRef: string;
  /** ISO-8601 UTC. */
  issuedAt?: string;
  /** ISO-8601 UTC. */
  expiresAt?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
}
