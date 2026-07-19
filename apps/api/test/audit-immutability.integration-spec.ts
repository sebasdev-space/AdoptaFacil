import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF04 immutability, enforced at the DATABASE level: audit rows cannot be
 * updated or deleted — not by the application role (no grant + trigger) and not
 * even by a privileged superuser (trigger fires for every caller on the normal
 * SQL path).
 */
describe('Audit immutability (append-only, DB-enforced)', () => {
  // Superuser connection — the strongest privilege available through the normal path.
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  // Application (non-superuser) connection.
  const appDb = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_APP } } });
  const orgId = randomUUID();
  let auditId = '';

  beforeAll(async () => {
    await admin.$connect();
    await appDb.$connect();
    await admin.organization.create({ data: { id: orgId, name: 'Immutable Audit Org' } });
    const row = await admin.auditLog.create({
      data: { organizationId: orgId, action: 'seed', entityType: 'probe', metadata: {} },
    });
    auditId = row.id;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, [orgId]);
    await admin.$disconnect();
    await appDb.$disconnect();
  });

  it('rejects UPDATE by a superuser (trigger)', async () => {
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE audit_logs SET action = 'tampered' WHERE id = $1::uuid`,
        auditId,
      ),
    ).rejects.toThrow(/append-only/i);
  });

  it('rejects DELETE by a superuser (trigger)', async () => {
    await expect(
      admin.$executeRawUnsafe(`DELETE FROM audit_logs WHERE id = $1::uuid`, auditId),
    ).rejects.toThrow(/append-only/i);
  });

  it('rejects TRUNCATE by a superuser (trigger)', async () => {
    await expect(admin.$executeRawUnsafe('TRUNCATE audit_logs')).rejects.toThrow(/append-only/i);
  });

  it('forbids the application role from updating or deleting audit rows', async () => {
    await expect(
      appDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
        await tx.$executeRawUnsafe(
          `UPDATE audit_logs SET action = 'x' WHERE id = $1::uuid`,
          auditId,
        );
      }),
    ).rejects.toThrow();
    await expect(
      appDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
        await tx.$executeRawUnsafe(`DELETE FROM audit_logs WHERE id = $1::uuid`, auditId);
      }),
    ).rejects.toThrow();
  });

  it('still allows reading the (unchanged) audit row', async () => {
    const row = await admin.auditLog.findUnique({ where: { id: auditId } });
    expect(row?.action).toBe('seed');
  });
});
