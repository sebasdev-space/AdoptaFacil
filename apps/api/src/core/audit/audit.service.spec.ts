import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';

interface TxMock {
  auditLog: { create: jest.Mock };
}

function makeTx(): TxMock {
  return {
    auditLog: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'audit-1',
          entityId: null,
          actorUserId: null,
          ...data,
          createdAt: new Date('2026-07-19T00:00:00.000Z'),
        }),
      ),
    },
  };
}

describe('AuditService', () => {
  const prisma = {} as unknown as PrismaService;

  it('builds and persists a well-formed event with a UTC ISO timestamp', async () => {
    const tx = makeTx();
    const service = new AuditService(prisma);

    const event = await service.recordWithTx(tx as never, {
      organizationId: 'org-1',
      actorUserId: 'actor-1',
      action: 'role.assigned',
      entityType: 'user',
      entityId: 'target-1',
      metadata: { role: 'administrator' },
    });

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(event).toMatchObject({
      organizationId: 'org-1',
      actorUserId: 'actor-1',
      action: 'role.assigned',
      entityType: 'user',
      entityId: 'target-1',
      metadata: { role: 'administrator' },
    });
    expect(event.createdAt).toBe('2026-07-19T00:00:00.000Z');
  });

  it('redacts known-sensitive metadata keys before persisting', async () => {
    const tx = makeTx();
    const service = new AuditService(prisma);

    await service.recordWithTx(tx as never, {
      organizationId: 'org-1',
      action: 'user.login',
      entityType: 'user',
      metadata: { password: 'hunter2', accessToken: 'abc', refreshToken: 'def', role: 'owner' },
    });

    const persisted = (
      tx.auditLog.create.mock.calls[0][0] as { data: { metadata: Record<string, unknown> } }
    ).data.metadata;
    expect(persisted).toEqual({
      password: '[REDACTED]',
      accessToken: '[REDACTED]',
      refreshToken: '[REDACTED]',
      role: 'owner',
    });
  });

  it('defaults optional fields (metadata, actor, entityId) safely', async () => {
    const tx = makeTx();
    const service = new AuditService(prisma);

    await service.recordWithTx(tx as never, {
      organizationId: 'org-1',
      action: 'organization.registered',
      entityType: 'organization',
    });

    const data = (tx.auditLog.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.metadata).toEqual({});
    expect(data.actorUserId).toBeNull();
    expect(data.entityId).toBeNull();
  });
});
