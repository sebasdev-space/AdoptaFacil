import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClinicalEventType, type Animal, type ClinicalEvent } from '@adoptafacil/contracts';
import type { AnimalsService } from './animals.service';
import type { ClinicalService } from './clinical.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContextService } from '../../core/tenant/tenant-context.service';
import { CarnetService } from './carnet.service';

/**
 * Unit tests for the carnet timeline assembly (S2-04B-2) — order (delegated to
 * `ClinicalService.listCurrent`, already most-recent-first) and author-name
 * enrichment. The DB is mocked; PDF byte-level rendering is covered instead by
 * the integration test (real content, real page count).
 */
function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'animal-1',
    organizationId: 'org-1',
    name: 'Firulais',
    species: 'dog',
    sex: 'male',
    size: 'medium',
    status: 'available',
    photos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function event(overrides: Partial<ClinicalEvent> = {}): ClinicalEvent {
  return {
    id: 'event-row-1',
    eventId: 'event-1',
    organizationId: 'org-1',
    animalId: 'animal-1',
    type: ClinicalEventType.Vaccine,
    occurredAt: '2026-06-01T00:00:00.000Z',
    details: {},
    version: 1,
    authorUserId: 'vet-1',
    attachments: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeService(opts: {
  organizationId?: string | null;
  animalResult?: Animal | Error;
  events?: ClinicalEvent[];
  users?: { id: string; displayName: string }[];
}) {
  const tenant = {
    getOrganizationId: () => ('organizationId' in opts ? opts.organizationId : 'org-1'),
  } as unknown as TenantContextService;
  const animals = {
    get: jest.fn().mockImplementation(async () => {
      if (opts.animalResult instanceof Error) throw opts.animalResult;
      return opts.animalResult ?? animal();
    }),
  } as unknown as AnimalsService;
  const clinical = {
    listCurrent: jest.fn().mockResolvedValue(opts.events ?? []),
  } as unknown as ClinicalService;
  const prisma = {
    withOrgContext: jest
      .fn()
      .mockImplementation((_org, fn) =>
        fn({ user: { findMany: jest.fn().mockResolvedValue(opts.users ?? []) } }),
      ),
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Refugio Test' }),
    },
  } as unknown as PrismaService;
  return {
    service: new CarnetService(prisma, tenant, animals, clinical),
    animals,
    clinical,
    prisma,
  };
}

describe('CarnetService.getTimeline (S2-04B-2)', () => {
  it('returns an empty timeline (not an error) when the animal has no clinical events', async () => {
    const { service } = makeService({ events: [] });
    expect(await service.getTimeline('animal-1')).toEqual([]);
  });

  it('enriches each event with the author display name resolved within the tenant', async () => {
    const { service, prisma } = makeService({
      events: [event({ authorUserId: 'vet-1' }), event({ id: 'e2', authorUserId: 'vet-2' })],
      users: [
        { id: 'vet-1', displayName: 'Dra. Ana' },
        { id: 'vet-2', displayName: 'Dr. Luis' },
      ],
    });
    const timeline = await service.getTimeline('animal-1');
    expect(timeline.map((t) => t.authorName)).toEqual(['Dra. Ana', 'Dr. Luis']);
    expect(prisma.withOrgContext).toHaveBeenCalledWith('org-1', expect.any(Function));
  });

  it('falls back to a placeholder when the author user row cannot be resolved', async () => {
    const { service } = makeService({ events: [event({ authorUserId: 'ghost' })], users: [] });
    const timeline = await service.getTimeline('animal-1');
    expect(timeline[0].authorName).toBe('Autor no disponible');
  });

  it('preserves the order ClinicalService.listCurrent already returns (most-recent-first)', async () => {
    const older = event({ id: 'e-old', occurredAt: '2026-01-01T00:00:00.000Z' });
    const newer = event({ id: 'e-new', occurredAt: '2026-06-01T00:00:00.000Z' });
    const { service } = makeService({ events: [newer, older] }); // already sorted by the mock
    const timeline = await service.getTimeline('animal-1');
    expect(timeline.map((t) => t.id)).toEqual(['e-new', 'e-old']);
  });

  it('404s (via AnimalsService.get) for a foreign-org or missing animal — never leaks existence', async () => {
    const { service } = makeService({ animalResult: new NotFoundException('Animal not found') });
    await expect(service.getTimeline('foreign-animal')).rejects.toThrow(NotFoundException);
  });

  it('rejects with 403 when there is no tenant context', async () => {
    const { service } = makeService({ organizationId: null });
    await expect(service.getTimeline('animal-1')).rejects.toThrow(ForbiddenException);
  });
});

describe('CarnetService.generateCarnetPdf (S2-04B-2)', () => {
  it('produces a non-empty PDF buffer starting with the %PDF signature', async () => {
    const { service } = makeService({
      events: [event()],
      users: [{ id: 'vet-1', displayName: 'Dra. Ana' }],
    });
    const buffer = await service.generateCarnetPdf('animal-1');
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });

  it('still produces a valid (empty-state) PDF when there are no clinical events', async () => {
    const { service } = makeService({ events: [] });
    const buffer = await service.generateCarnetPdf('animal-1');
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
