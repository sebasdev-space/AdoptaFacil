import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuditService } from '../../core/audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { StoragePort } from '../../core/storage/storage.port';
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
}

function makeTx(overrides: Partial<TxMock> = {}): TxMock {
  return {
    animal: {
      findUnique: jest.fn().mockResolvedValue({ id: 'animal-1' }),
      update: jest.fn().mockResolvedValue({ id: 'animal-1', isActive: false }),
    },
    adoptionRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

function makeService(tx: TxMock): AnimalsService {
  const prisma = {
    withOrgContext: jest
      .fn()
      .mockImplementation((_org: string, cb: (t: TxMock) => Promise<unknown>) => cb(tx)),
  } as unknown as PrismaService;
  const tenant = { getOrganizationId: () => 'org-1' } as unknown as TenantContextService;
  const audit = { recordWithTx: jest.fn() } as unknown as AuditService;
  const storage = {} as unknown as StoragePort;
  return new AnimalsService(prisma, tenant, audit, storage);
}

describe('AnimalsService.remove (S2-04A §3.4)', () => {
  it('soft-deactivates the animal when there is no active adoption request', async () => {
    const tx = makeTx();
    const service = makeService(tx);

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
    const service = makeService(tx);

    await expect(service.remove('actor-1', 'missing')).rejects.toThrow(NotFoundException);
    expect(tx.animal.update).not.toHaveBeenCalled();
  });

  it('rejects with 409 when an active adoption request is linked, and does not deactivate', async () => {
    const tx = makeTx({
      adoptionRequest: {
        findFirst: jest.fn().mockResolvedValue({ id: 'req-1', status: 'in_review' }),
      },
    });
    const service = makeService(tx);

    await expect(service.remove('actor-1', 'animal-1')).rejects.toThrow(ConflictException);
    expect(tx.animal.update).not.toHaveBeenCalled();
  });
});
