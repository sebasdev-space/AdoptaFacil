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
