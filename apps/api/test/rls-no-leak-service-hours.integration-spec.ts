import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M08 service hours (RF18/RF19 · S-6): tenant-isolated (no
 * cross-org visibility, no cross-org write) on the authenticated path.
 * Connects as the NON-SUPERUSER app role.
 */
const APP_DATABASE_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://adoptafacil_app:adoptafacil_app@localhost:5433/adoptafacil?schema=public';

async function withOrgContext<T>(
  prisma: PrismaClient,
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

describe('RLS cross-org no-leak (service_hours)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const volunteer = randomUUID();

  async function seed(orgId: string, tag: string) {
    const opportunity = await withOrgContext(prisma, orgId, (tx) =>
      tx.volunteerOpportunity.create({
        data: {
          organizationId: orgId,
          title: `Oportunidad ${tag}`,
          category: 'food',
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-09-30T00:00:00.000Z'),
          location: `Refugio ${tag}`,
        },
      }),
    );
    const enrollment = await withOrgContext(prisma, orgId, (tx) =>
      tx.volunteerEnrollment.create({
        data: {
          organizationId: orgId,
          opportunityId: opportunity.id,
          volunteerUserId: volunteer,
          volunteerName: 'Voluntario',
          volunteerEmail: 'voluntario@test.local',
          appliesToStudentService: false,
          status: 'accepted',
        },
      }),
    );
    return withOrgContext(prisma, orgId, (tx) =>
      tx.serviceHours.create({
        data: {
          organizationId: orgId,
          enrollmentId: enrollment.id,
          volunteerUserId: volunteer,
          date: new Date('2026-09-05T00:00:00.000Z'),
          hours: 3,
          description: `Sesión ${tag}`,
        },
      }),
    );
  }

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    await admin.user.create({
      data: {
        id: volunteer,
        organizationId: orgA,
        accountType: 'person',
        email: `vol-${orgA}@test.local`,
        displayName: 'Voluntario',
      },
    });

    await seed(orgA, 'A');
    await seed(orgB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own service-hours entries, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.serviceHours.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.description === 'Sesión B')).toBe(false);
  });

  it('no-leak: Org B sees only its own service-hours entries, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.serviceHours.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
    expect(rows.some((r) => r.description === 'Sesión A')).toBe(false);
  });

  it('no-leak: with no tenant context, no service-hours entries are visible', async () => {
    expect(await prisma.serviceHours.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a service-hours entry for a different org than the context', async () => {
    const enrollmentA = await withOrgContext(prisma, orgA, (tx) =>
      tx.volunteerEnrollment.findFirstOrThrow(),
    );
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.serviceHours.create({
          data: {
            organizationId: orgB,
            enrollmentId: enrollmentA.id,
            volunteerUserId: volunteer,
            date: new Date('2026-09-05T00:00:00.000Z'),
            hours: 1,
            description: 'Intruso',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
