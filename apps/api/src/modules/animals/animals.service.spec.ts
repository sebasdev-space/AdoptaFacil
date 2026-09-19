import { ConflictException, NotFoundException } from '@nestjs/common';
import { SponsorshipStatus } from '@adoptafacil/contracts';
import type { AuditService } from '../../core/audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { StoragePort } from '../../core/storage/storage.port';
import type { NotificationPort } from '../../core/notifications/notification.port';
import type { SponsorshipsService } from '../sponsorships/sponsorships.service';
import { AnimalsService } from './animals.service';

/**
 * Unit tests for `remove` (S2-04A §3.4) — a physical DELETE is impossible on
 * `animals` (trigger rejects it for every role, RF07), so "delete" from the
 * UI's perspective is a soft deactivation, BLOCKED while an active adoption
 * request is tied to the animal. The DB is mocked.
 */
interface TxMock {
  animal: { findUnique: jest.Mock; update: jest.Mock };
  adoptionRequest: { findFirst: jest.Mock };
  $queryRaw: jest.Mock;
}

function makeTx(overrides: Partial<TxMock> = {}, activeSponsors: unknown[] = []): TxMock {
  return {
    animal: {
      findUnique: jest.fn().mockResolvedValue({ id: 'animal-1', organizationId: 'org-1' }),
      update: jest.fn().mockResolvedValue({
        id: 'animal-1',
        organizationId: 'org-1',
        name: 'Firulais',
        species: 'dog',
        sex: 'unknown',
        size: 'medium',
        status: 'deceased',
        tags: [],
        isActive: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        photos: [],
        breed: null,
      }),
    },
    adoptionRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue(activeSponsors),
    ...overrides,
  };
}

interface ServiceMocks {
  prisma: PrismaService;
  audit: AuditService;
  sponsorships: SponsorshipsService;
  notifications: NotificationPort;
}

function makeService(
  tx: TxMock,
  opts: { audit?: AuditService } = {},
): { service: AnimalsService; mocks: ServiceMocks } {
  const prisma = {
    withOrgContext: jest
      .fn()
      .mockImplementation((_org: string, cb: (t: TxMock) => Promise<unknown>) => cb(tx)),
  } as unknown as PrismaService;
  const tenant = { getOrganizationId: () => 'org-1' } as unknown as TenantContextService;
  const audit = opts.audit ?? ({ recordWithTx: jest.fn() } as unknown as AuditService);
  const storage = {} as unknown as StoragePort;
  const sponsorships = {
    applySystemTransition: jest.fn().mockResolvedValue(undefined),
  } as unknown as SponsorshipsService;
  const notifications = {
    send: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationPort;
  const service = new AnimalsService(prisma, tenant, audit, storage, sponsorships, notifications);
  return { service, mocks: { prisma, audit, sponsorships, notifications } };
}

describe('AnimalsService.remove (S2-04A §3.4)', () => {
  it('soft-deactivates the animal when there is no active adoption request', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.remove('actor-1', 'animal-1');

    expect(tx.adoptionRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { animalId: 'animal-1', status: { in: ['new', 'in_review', 'approved'] } },
      }),
    );
    expect(tx.animal.update).toHaveBeenCalledWith({
      where: { id: 'animal-1' },
      data: { isActive: false },
    });
  });

  it('rejects with 404 when the animal does not exist', async () => {
    const tx = makeTx({
      animal: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    });
    const { service } = makeService(tx);

    await expect(service.remove('actor-1', 'missing')).rejects.toThrow(NotFoundException);
    expect(tx.animal.update).not.toHaveBeenCalled();
  });

  it('rejects with 409 when an active adoption request is linked, and does not deactivate', async () => {
    const tx = makeTx({
      adoptionRequest: {
        findFirst: jest.fn().mockResolvedValue({ id: 'req-1', status: 'in_review' }),
      },
    });
    const { service } = makeService(tx);

    await expect(service.remove('actor-1', 'animal-1')).rejects.toThrow(ConflictException);
    expect(tx.animal.update).not.toHaveBeenCalled();
  });
});

/**
 * Unit tests for `registerDeath` (M07 hallazgo QA, `POST
 * /animals/:id/register-death`): marks the animal deceased/inactive, suspends
 * every ACTIVE sponsorship via `SponsorshipsService.applySystemTransition`
 * (mocked here — its own state machine is covered by
 * `sponsorship-status.spec.ts`), audits the affected count, and notifies each
 * sponsor best-effort. The DB and SponsorshipsService are mocked.
 */
describe('AnimalsService.registerDeath (M07 hallazgo QA)', () => {
  it('marks the animal deceased/inactive and suspends every active sponsorship with the deceased reason', async () => {
    const activeSponsors = [
      { sponsorship_id: 'sp-1', sponsor_user_id: 'user-1', sponsor_email: 'a@test.local' },
      { sponsorship_id: 'sp-2', sponsor_user_id: 'user-2', sponsor_email: 'b@test.local' },
    ];
    const tx = makeTx({}, activeSponsors);
    const { service, mocks } = makeService(tx);

    const result = await service.registerDeath('actor-1', 'animal-1');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.animal.update).toHaveBeenCalledWith({
      where: { id: 'animal-1' },
      data: { status: 'deceased', isActive: false },
      include: { photos: true, breed: true },
    });
    expect(mocks.sponsorships.applySystemTransition).toHaveBeenCalledTimes(2);
    expect(mocks.sponsorships.applySystemTransition).toHaveBeenNthCalledWith(
      1,
      tx,
      'org-1',
      'sp-1',
      SponsorshipStatus.Suspended,
      expect.stringContaining('fallecido'),
    );
    expect(mocks.notifications.send).toHaveBeenCalledTimes(2);
    expect(mocks.notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@test.local' }),
    );
    expect(result.status).toBe('deceased');
    expect(result.isActive).toBe(false);
  });

  it('leaves already-suspended/cancelled sponsorships untouched (only active ones are looked up)', async () => {
    const tx = makeTx({}, []);
    const { service, mocks } = makeService(tx);

    await service.registerDeath('actor-1', 'animal-1');

    expect(mocks.sponsorships.applySystemTransition).not.toHaveBeenCalled();
    expect(mocks.notifications.send).not.toHaveBeenCalled();
    expect(tx.animal.update).toHaveBeenCalledTimes(1);
  });

  it('audits the action with the affected-sponsorship COUNT, never sponsor PII', async () => {
    const tx = makeTx({}, [
      { sponsorship_id: 'sp-1', sponsor_user_id: 'u1', sponsor_email: 'a@test.local' },
    ]);
    const recordWithTx = jest.fn();
    const { service } = makeService(tx, {
      audit: { recordWithTx } as unknown as AuditService,
    });

    await service.registerDeath('actor-1', 'animal-1');

    expect(recordWithTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: 'org-1',
        actorUserId: 'actor-1',
        action: 'animal.deceased',
        entityType: 'animal',
        entityId: 'animal-1',
        metadata: { affectedSponsorshipsCount: 1 },
      }),
    );
  });

  it('rejects with 404 when the animal does not exist', async () => {
    const tx = makeTx({
      animal: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    });
    const { service, mocks } = makeService(tx);

    await expect(service.registerDeath('actor-1', 'missing')).rejects.toThrow(NotFoundException);
    expect(tx.animal.update).not.toHaveBeenCalled();
    expect(mocks.sponsorships.applySystemTransition).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects with 404 when the animal belongs to another organization', async () => {
    const tx = makeTx({
      animal: {
        findUnique: jest.fn().mockResolvedValue({ id: 'animal-1', organizationId: 'org-OTHER' }),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await expect(service.registerDeath('actor-1', 'animal-1')).rejects.toThrow(NotFoundException);
    expect(tx.animal.update).not.toHaveBeenCalled();
  });
});
