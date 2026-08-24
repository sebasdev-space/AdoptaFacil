import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M08 volunteer enrollments (RF18 · S-6): tenant-isolated (no
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

describe('RLS cross-org no-leak (volunteer_enrollments)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const volunteerA = randomUUID();
  const volunteerB = randomUUID();

  async function seed(orgId: string, volunteerId: string, tag: string) {
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
    return withOrgContext(prisma, orgId, (tx) =>
      tx.volunteerEnrollment.create({
        data: {
          organizationId: orgId,
          opportunityId: opportunity.id,
          volunteerUserId: volunteerId,
          volunteerName: `Voluntario ${tag}`,
          volunteerEmail: `voluntario-${tag}@test.local`,
          appliesToStudentService: false,
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
    await admin.user.createMany({
      data: [
        {
          id: volunteerA,
          organizationId: orgA,
          accountType: 'person',
          email: `vol-a-${orgA}@test.local`,
          displayName: 'Voluntario A',
        },
        {
          id: volunteerB,
          organizationId: orgB,
          accountType: 'person',
          email: `vol-b-${orgB}@test.local`,
          displayName: 'Voluntario B',
        },
      ],
      skipDuplicates: true,
    });

    await seed(orgA, volunteerA, 'A');
    await seed(orgB, volunteerB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own enrollments, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.volunteerEnrollment.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.volunteerName === 'Voluntario B')).toBe(false);
  });

  it('no-leak: Org B sees only its own enrollments, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.volunteerEnrollment.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
    expect(rows.some((r) => r.volunteerName === 'Voluntario A')).toBe(false);
  });

  it('no-leak: with no tenant context, no enrollments are visible', async () => {
    expect(await prisma.volunteerEnrollment.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing an enrollment for a different org than the context', async () => {
    const opportunityA = await withOrgContext(prisma, orgA, (tx) =>
      tx.volunteerOpportunity.findFirstOrThrow(),
    );
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.volunteerEnrollment.create({
          data: {
            organizationId: orgB,
            opportunityId: opportunityA.id,
            volunteerUserId: volunteerA,
            volunteerName: 'Intruso',
            volunteerEmail: 'intruso@test.local',
            appliesToStudentService: false,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
