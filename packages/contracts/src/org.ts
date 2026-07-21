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
