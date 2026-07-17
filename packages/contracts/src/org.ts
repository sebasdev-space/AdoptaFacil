// Module: org · Contracts owner: @sebastian
//
// Tenant foundation contracts (RF §14 multi-tenant, RNF03). All timestamps are
// ISO-8601 strings in UTC — Colombia local time is a presentation concern only.

/**
 * A tenant organization: the platform-level account that owns every piece of
 * business data. Mirrors the `organizations` registry table (which is itself
 * NOT under RLS — it is the global catalog every business table references).
 */
export interface Organization {
  id: string;
  name: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
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
