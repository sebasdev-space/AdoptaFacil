import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M08 volunteer certificates (RF18/RF19 · S-6): tenant-isolated
 * (no cross-org visibility, no cross-org write) on the authenticated path.
 * Connects as the NON-SUPERUSER app role. `volunteer_certificates` is
 * append-only from day one (S-6) — this file only exercises the authenticated
 * RLS path (INSERT/SELECT), never UPDATE/DELETE (see the migration's own
 * triggers, exercised in `volunteering.integration-spec.ts`).
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

describe('RLS cross-org no-leak (volunteer_certificates)', () => {
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
      tx.volunteerCertificate.create({
        data: {
          organizationId: orgId,
          enrollmentId: enrollment.id,
          volunteerUserId: volunteer,
          volunteerName: 'Voluntario',
          organizationName: `Org ${tag}`,
          opportunityTitle: `Oportunidad ${tag}`,
          totalApprovedHours: 5,
          periodStart: new Date('2026-09-01T00:00:00.000Z'),
          periodEnd: new Date('2026-09-30T00:00:00.000Z'),
          appliesToStudentService: false,
          issuedByUserId: volunteer,
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

  it('no-leak: Org A sees only its own certificates, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.volunteerCertificate.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.organizationName === 'Org B')).toBe(false);
  });

  it('no-leak: Org B sees only its own certificates, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.volunteerCertificate.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
    expect(rows.some((r) => r.organizationName === 'Org A')).toBe(false);
  });

  it('no-leak: with no tenant context, no certificates are visible', async () => {
    expect(await prisma.volunteerCertificate.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a certificate for a different org than the context', async () => {
    const enrollmentA = await withOrgContext(prisma, orgA, (tx) =>
      tx.volunteerEnrollment.findFirstOrThrow(),
    );
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.volunteerCertificate.create({
          data: {
            organizationId: orgB,
            enrollmentId: enrollmentA.id,
            volunteerUserId: volunteer,
            volunteerName: 'Intruso',
            organizationName: 'X',
            opportunityTitle: 'X',
            totalApprovedHours: 1,
            periodStart: new Date('2026-09-01T00:00:00.000Z'),
            periodEnd: new Date('2026-09-30T00:00:00.000Z'),
            appliesToStudentService: false,
            issuedByUserId: volunteer,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
