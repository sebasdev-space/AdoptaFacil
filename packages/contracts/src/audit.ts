// Module: core audit · Contracts owner: @sebastian
//
// RNF04: append-only, immutable audit trail (retention 10 years). Every module
// records events through the core AuditService; this is the shared shape of a
// recorded event. Timestamps are ISO-8601 UTC (Colombia local time is a
// presentation concern only). `metadata` must never contain secrets (passwords,
// tokens, …) — the AuditService redacts known-sensitive keys defensively.

/** A single append-only audit event, scoped to an organization. */
export interface AuditEvent {
  id: string;
  organizationId: string;
  /** The user who performed the action, or null for system/self events. */
  actorUserId: string | null;
  /** Machine-readable action, e.g. "role.assigned", "organization.registered". */
  action: string;
  /** The kind of entity affected, e.g. "user", "organization". */
  entityType: string;
  /** Identifier of the affected entity, when applicable. */
  entityId: string | null;
  /** Non-sensitive contextual data. */
  metadata: Record<string, unknown>;
  /** ISO-8601 UTC timestamp of when the event was recorded. */
  createdAt: string;
}

/** Fields a caller supplies to record an event (ids/timestamp are assigned). */
export interface AuditEventInput {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}
