import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to M04 post-adoption follow-up (`adoption_followup_milestones`
 * and `adoption_followup_evidence`, T-028c): both belong to the owning organization
 * and must never be visible under another org's context. Connects as the
 * NON-SUPERUSER `adoptafacil_app` role. Every test name contains "no-leak" so the
 * `test:rls` gate (-t "no-leak") runs it.
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

/** Seed request → contract → milestone → evidence for `organizationId`. */
async function seedFollowUp(
  prisma: PrismaClient,
  organizationId: string,
  tag: string,
): Promise<void> {
  await withOrgContext(prisma, organizationId, async (tx) => {
    const animalId = randomUUID();
    const adopterUserId = randomUUID();
    const req = await tx.adoptionRequest.create({
      data: {
        organizationId,
        animalId,
        animalSnapshot: { animalId, name: tag, species: 'dog' },
        applicantUserId: adopterUserId,
        applicant: { fullName: tag, email: `${tag}@test.local` },
        message: `Solicitud ${tag} con un mensaje suficientemente largo para pasar la validación.`,
      },
    });
    const contract = await tx.adoptionContract.create({
      data: {
        organizationId,
        requestId: req.id,
        animalId,
        version: 1,
        status: 'signed',
        signers: [{ id: randomUUID(), role: 'adopter', fullName: tag, email: 'x@test.local' }],
        payload: { requestId: req.id, organizationId, animalId, terms: tag },
      },
    });
    const milestone = await tx.adoptionFollowUpMilestone.create({
      data: {
        organizationId,
        contractId: contract.id,
        requestId: req.id,
        adopterUserId,
        adopterName: tag,
        adopterEmail: `${tag}@test.local`,
        title: `Hito ${tag}`,
        questionnaire: [],
        dueAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    await tx.adoptionFollowUpEvidence.create({
      data: {
        organizationId,
        milestoneId: milestone.id,
        kind: 'questionnaire',
        answers: { note: tag },
        submittedByUserId: adopterUserId,
      },
    });
  });
}

describe('RLS cross-org no-leak (adoption follow-up)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    await seedFollowUp(prisma, orgA, 'secret-A');
    await seedFollowUp(prisma, orgB, 'secret-B');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, [orgA, orgB]);
    await prisma.$disconnect();
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own milestones + evidence, never Org B', async () => {
    const { milestones, evidence } = await withOrgContext(prisma, orgA, async (tx) => ({
      milestones: await tx.adoptionFollowUpMilestone.findMany({ select: { organizationId: true } }),
      evidence: await tx.adoptionFollowUpEvidence.findMany({ select: { organizationId: true } }),
    }));
    expect(milestones.length).toBeGreaterThan(0);
    expect(milestones.every((r) => r.organizationId === orgA)).toBe(true);
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: Org B sees only its own milestones + evidence, never Org A (inverse)', async () => {
    const { milestones, evidence } = await withOrgContext(prisma, orgB, async (tx) => ({
      milestones: await tx.adoptionFollowUpMilestone.findMany({ select: { organizationId: true } }),
      evidence: await tx.adoptionFollowUpEvidence.findMany({ select: { organizationId: true } }),
    }));
    expect(milestones.every((r) => r.organizationId === orgB)).toBe(true);
    expect(evidence.every((r) => r.organizationId === orgB)).toBe(true);
  });

  it('no-leak: with no org context set, neither milestones nor evidence are visible', async () => {
    expect(await prisma.adoptionFollowUpMilestone.findMany()).toHaveLength(0);
    expect(await prisma.adoptionFollowUpEvidence.findMany()).toHaveLength(0);
  });
});
