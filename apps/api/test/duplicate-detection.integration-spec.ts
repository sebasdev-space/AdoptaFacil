import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { DuplicateDetectionService } from '../src/modules/org/duplicate-detection.service';
import { purgeOrganizations } from './support/cleanup';

/**
 * M01 duplicate-organization detection (S-3) — service-level coverage of the
 * two similarity computations in isolation, bypassing HTTP/the profile-write
 * flow (that end-to-end path is covered separately in
 * organization-duplicates.integration-spec.ts). Both signals are backed by
 * real Postgres functions (`find_organization_by_nit`, `pg_trgm`'s
 * `similarity()`), so this runs against the real test database rather than a
 * mock — there is no pure-JS equivalent to unit test against.
 */
describe('DuplicateDetectionService (M01, S-3): NIT + name-similarity computation', () => {
  let app: INestApplication;
  let service: DuplicateDetectionService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];

  async function seedOrg(name: string, nit?: string): Promise<string> {
    const org = await admin.organization.create({ data: { name } });
    createdOrgIds.push(org.id);
    if (nit) {
      await admin.organizationProfile.create({ data: { organizationId: org.id, nit } });
    }
    return org.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(DuplicateDetectionService);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  describe('findNitConflict (exact match, hard rule)', () => {
    it('finds the OTHER organization already holding the exact NIT', async () => {
      const nit = `900${randomUUID().slice(0, 6)}-7`;
      const existing = await seedOrg('Fundación Existente', nit);
      const candidateOrgId = await seedOrg('Fundación Nueva');

      const conflict = await service.findNitConflict(candidateOrgId, nit);
      expect(conflict).toEqual({
        organizationId: existing,
        organizationName: 'Fundación Existente',
      });
    });

    it('never reports a conflict against the caller´s OWN organization', async () => {
      const nit = `900${randomUUID().slice(0, 6)}-8`;
      const orgId = await seedOrg('Fundación Sola', nit);

      expect(await service.findNitConflict(orgId, nit)).toBeNull();
    });

    it('returns null when no organization holds this NIT', async () => {
      const orgId = await seedOrg('Fundación Sin Conflicto');
      expect(await service.findNitConflict(orgId, `000${randomUUID().slice(0, 6)}-0`)).toBeNull();
    });
  });

  describe('findSimilarNames (fuzzy match, never blocks)', () => {
    it('finds a name ABOVE the similarity threshold (near-identical, one-word typo)', async () => {
      const token = randomUUID().slice(0, 8);
      const existing = await seedOrg(`Fundación Patitas Felices ${token}`);
      const candidateOrgId = await seedOrg(`Fundacion Patitas Felises ${token}`);

      const matches = await service.findSimilarNames(
        candidateOrgId,
        `Fundacion Patitas Felises ${token}`,
      );
      expect(matches.some((m) => m.organizationId === existing)).toBe(true);
      const match = matches.find((m) => m.organizationId === existing)!;
      expect(match.similarityScore).toBeGreaterThan(0.4);
    });

    it('does NOT flag two completely different names', async () => {
      const existing = await seedOrg(`Zebra Marchito Volcán ${randomUUID()}`);
      const candidateOrgId = await seedOrg(`Delfín Cactus Tornado ${randomUUID()}`);

      const matches = await service.findSimilarNames(
        candidateOrgId,
        `Delfín Cactus Tornado ${randomUUID()}`,
      );
      expect(matches.some((m) => m.organizationId === existing)).toBe(false);
    });

    it('excludes the caller´s OWN organization but still finds an unrelated org with the identical name', async () => {
      const name = `Fundación Repetida ${randomUUID()}`;
      const otherOrgId = await seedOrg(name);
      const candidateOrgId = await seedOrg(name);

      const matches = await service.findSimilarNames(candidateOrgId, name);
      expect(matches.some((m) => m.organizationId === candidateOrgId)).toBe(false);
      expect(matches.some((m) => m.organizationId === otherOrgId)).toBe(true);
    });
  });
});
