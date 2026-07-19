import type { PrismaClient } from '@prisma/client';

/**
 * Test teardown helper. `audit_logs` is append-only — a database trigger rejects
 * every DELETE (RNF04), which also blocks the cascade when an organization is
 * removed. For TEST cleanup only, this bypasses the trigger on a SUPERUSER
 * connection via `session_replication_role = replica` (transaction-local, so it
 * never leaks), deletes the audit rows of the given orgs, then removes the orgs
 * normally (cascade clears users, roles, credentials, tokens, …).
 *
 * `admin` MUST be a PrismaClient connected with the superuser DATABASE_URL.
 */
export async function purgeOrganizations(
  admin: PrismaClient,
  organizationIds: string[],
): Promise<void> {
  if (organizationIds.length === 0) {
    return;
  }
  await admin.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    for (const id of organizationIds) {
      await tx.$executeRawUnsafe('DELETE FROM audit_logs WHERE organization_id = $1::uuid', id);
    }
  });
  await admin.organization.deleteMany({ where: { id: { in: organizationIds } } });
}
