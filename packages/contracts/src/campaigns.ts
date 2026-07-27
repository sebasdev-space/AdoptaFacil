// Module: M06 campaigns · Contracts owner: @sebastian
//
// Fundraising campaigns (RF15, §9 M06). Published contract-first for the public
// portal (M14, @fabian) and internal management. All amounts are INTEGER COP
// pesos (never float), coherent with payments. All timestamps are ISO-8601 UTC
// (Colombia local time is a presentation concern only).

/**
 * Campaign category — CLOSED list from the base document (§9). Stable string
 * values; the Spanish label is a UI concern. Do NOT invent new categories.
 * - `medications`     — medicamentos
 * - `food`            — alimentación
 * - `surgeries`       — cirugías
 * - `sterilizations`  — esterilizaciones
 * - `infrastructure`  — infraestructura
 * - `emergencies`     — emergencias
 */
export enum CampaignCategory {
  Medications = 'medications',
  Food = 'food',
  Surgeries = 'surgeries',
  Sterilizations = 'sterilizations',
  Infrastructure = 'infrastructure',
  Emergencies = 'emergencies',
}

/** Allowed categories, exported for validation and UI dropdowns. */
export const CAMPAIGN_CATEGORIES: readonly CampaignCategory[] = [
  CampaignCategory.Medications,
  CampaignCategory.Food,
  CampaignCategory.Surgeries,
  CampaignCategory.Sterilizations,
  CampaignCategory.Infrastructure,
  CampaignCategory.Emergencies,
];

/**
 * Campaign lifecycle status (minimal, refinable). String values stable.
 * - `active`    — recibiendo apoyo
 * - `closed`    — finalizada (meta alcanzada o vencida)
 * - `cancelled` — cancelada por la organización
 * TODO(client): richer states (e.g. paused/draft) if the client defines them.
 */
export enum CampaignStatus {
  Active = 'active',
  Closed = 'closed',
  Cancelled = 'cancelled',
}

/**
 * A fundraising campaign (expediente de campaña). `raisedAmount` is 0 until real
 * donations land (T-055); `progress` is DERIVED (raised/goal, 0..1) — never
 * stored. `goalAmount`/`raisedAmount` are integer COP pesos.
 */
export interface Campaign {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  category: CampaignCategory;
  /** Fundraising goal in integer COP pesos (> 0). */
  goalAmount: number;
  /** Amount raised so far in integer COP pesos (0 until T-055). */
  raisedAmount: number;
  /** Derived progress toward the goal, 0..1. */
  progress: number;
  /** ISO-8601 UTC deadline. */
  deadline: string;
  status: CampaignStatus;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/**
 * Public projection of a campaign for the portal (M14). Only public columns —
 * no internal/sensitive fields. Includes the owning org's display name.
 */
export interface CampaignPublic {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description?: string;
  category: CampaignCategory;
  goalAmount: number;
  raisedAmount: number;
  progress: number;
  deadline: string;
  status: CampaignStatus;
  createdAt: string;
}

/** Create a campaign (Owner/Administrator/Operator). Title, goal, deadline and
 *  category are required; description is recommended. */
export interface CreateCampaignInput {
  title: string;
  description?: string;
  category: CampaignCategory;
  /** Integer COP pesos, > 0. */
  goalAmount: number;
  /** ISO-8601 UTC deadline. */
  deadline: string;
}

/** Patch a campaign. All fields optional; only provided fields change. */
export interface UpdateCampaignInput {
  title?: string;
  description?: string;
  category?: CampaignCategory;
  goalAmount?: number;
  deadline?: string;
  status?: CampaignStatus;
}

/** Generic paginated result (limit/offset, capped server-side). */
export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// Accountability / rendición de cuentas (RF16, §9 M06) — T-054. An organization
// uploads spending evidences (invoices/receipts/proofs/photos) against a
// campaign; the public accountability report shows what was spent, with the
// evidences. Files go through StoragePort as PUBLIC objects (the donor must see
// them). Amounts are INTEGER COP pesos. This slice does NOT wire real raised
// amounts (that is T-055): the report shows declared spending only, never a
// fabricated "executed %" against a still-zero raised amount.
// ============================================================================

/**
 * Kind of spending evidence — CLOSED list (RF16 spirit). Stable string values.
 * - `invoice` — factura
 * - `receipt` — recibo / comprobante de pago
 * - `proof`   — soporte / constancia
 * - `photo`   — foto de la ejecución (may carry no amount)
 */
export enum CampaignEvidenceType {
  Invoice = 'invoice',
  Receipt = 'receipt',
  Proof = 'proof',
  Photo = 'photo',
}

/** Allowed evidence types, exported for validation and UI. */
export const CAMPAIGN_EVIDENCE_TYPES: readonly CampaignEvidenceType[] = [
  CampaignEvidenceType.Invoice,
  CampaignEvidenceType.Receipt,
  CampaignEvidenceType.Proof,
  CampaignEvidenceType.Photo,
];

/**
 * A spending evidence attached to a campaign (internal projection). `amount` is
 * integer COP pesos and OPTIONAL (a photo may carry no monetary value).
 * `storageRef` is the opaque public storage key; timestamps are ISO-8601 UTC.
 */
export interface CampaignEvidence {
  id: string;
  organizationId: string;
  campaignId: string;
  type: CampaignEvidenceType;
  concept: string;
  /** Declared spending in integer COP pesos (> 0); absent for e.g. photos. */
  amount?: number;
  /** ISO-8601 UTC date the money was spent. */
  spentAt: string;
  /** Opaque PUBLIC storage key of the uploaded file. */
  storageRef: string;
  /** Display order within the campaign's evidence list. */
  order: number;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Create a spending evidence. The file bytes are PUT to the returned upload
 *  target afterwards (same two-step flow as animal photos). */
export interface CreateCampaignEvidenceInput {
  type: CampaignEvidenceType;
  concept: string;
  /** Integer COP pesos, > 0. Omit for a photo without a monetary value. */
  amount?: number;
  /** ISO-8601 UTC. */
  spentAt: string;
  filename: string;
  contentType?: string;
  order?: number;
}

/** Patch a spending evidence (business fields only; the file is immutable). */
export interface UpdateCampaignEvidenceInput {
  type?: CampaignEvidenceType;
  concept?: string;
  amount?: number;
  spentAt?: string;
  order?: number;
}

/** Returned on evidence creation: the row plus the target to PUT the bytes to. */
export interface CampaignEvidenceUploadResult {
  evidence: CampaignEvidence;
  upload: { url: string; key: string };
}

/**
 * Public projection of an evidence (public columns only — no internal ids beyond
 * the evidence id). `url` resolves the public file for the donor to open.
 */
export interface CampaignEvidencePublic {
  id: string;
  type: CampaignEvidenceType;
  concept: string;
  amount?: number;
  spentAt: string;
  storageRef: string;
  /** Public serve URL for the file. */
  url: string;
  order: number;
}

/**
 * Public accountability report of a campaign (RF16): the public campaign, its
 * public evidences, and the SUM of declared spending (integer COP). Never
 * exposes internal data nor evidences of cancelled campaigns. It does NOT claim
 * an "executed %" — the relation to raised funds is wired in T-055.
 */
export interface CampaignAccountabilityReport {
  campaign: CampaignPublic;
  evidences: CampaignEvidencePublic[];
  /** Sum of declared spending across the evidences, in integer COP pesos. */
  totalSpent: number;
}
