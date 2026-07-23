import type { PrismaClient } from '@prisma/client';

/**
 * Test teardown helper. Some tables are append-only — a database trigger rejects
 * every DELETE (audit_logs RNF04, formalization_transitions RF02), which also
 * blocks the cascade when an organization is removed. For TEST cleanup only,
 * this bypasses the triggers on a SUPERUSER connection via
 * `session_replication_role = replica` (transaction-local, so it never leaks),
 * deletes those append-only rows for the given orgs, then removes the orgs
 * normally (cascade clears users, roles, credentials, profiles, tokens, …).
 *
 * `admin` MUST be a PrismaClient connected with the superuser DATABASE_URL.
 */
// organization_documents is not fully append-only (one decision UPDATE is
// allowed) but its DELETE/TRUNCATE triggers reject removal for every role, which
// also blocks the org cascade — so it is purged here under replica mode too.
// animals is soft-delete only (DELETE/TRUNCATE triggers reject removal), same
// deal; its animal_photos cascade once the animal rows are gone.
const APPEND_ONLY_TABLES = [
  'audit_logs',
  'formalization_transitions',
  'organization_documents',
  'animals',
];

export async function purgeOrganizations(
  admin: PrismaClient,
  organizationIds: string[],
): Promise<void> {
  if (organizationIds.length === 0) {
    return;
  }
  await admin.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    for (const table of APPEND_ONLY_TABLES) {
      for (const id of organizationIds) {
        await tx.$executeRawUnsafe(`DELETE FROM ${table} WHERE organization_id = $1::uuid`, id);
      }
    }
  });
  await admin.organization.deleteMany({ where: { id: { in: organizationIds } } });
}
