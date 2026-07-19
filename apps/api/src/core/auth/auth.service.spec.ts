import type { NotificationPort } from '../../notifications/notification.port';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';

/**
 * Unit tests for the Owner-on-registration behavior (T-012b) and its atomicity.
 * The DB is mocked; the assertions focus on: (a) every write for an org
 * registration flows through a SINGLE withOrgContext transaction, (b) the Owner
 * role is created for organizations only, and (c) a failure in the role write
 * propagates so the (real) transaction would roll back.
 */
interface TxMock {
  organization: { create: jest.Mock };
  user: { create: jest.Mock };
  authCredential: { create: jest.Mock };
  userRole: { create: jest.Mock };
}

function makeTx(): TxMock {
  return {
    organization: { create: jest.fn().mockResolvedValue({}) },
    user: { create: jest.fn().mockResolvedValue({}) },
    authCredential: { create: jest.fn().mockResolvedValue({}) },
    userRole: { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeService(tx: TxMock): { service: AuthService; withOrgContext: jest.Mock } {
  const withOrgContext = jest
    .fn()
    .mockImplementation((_org: string, cb: (t: TxMock) => Promise<unknown>) => cb(tx));
  const prisma = {
    authCredential: { findUnique: jest.fn().mockResolvedValue(null) },
    withOrgContext,
  } as unknown as PrismaService;
  const passwords = { hash: jest.fn().mockResolvedValue('hashed') } as unknown as PasswordService;
  const tokens = {
    issueTokens: jest
      .fn()
      .mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
        tokenType: 'Bearer',
        expiresIn: 900,
      }),
  } as unknown as TokenService;
  const notifications = { send: jest.fn() } as unknown as NotificationPort;
  return { service: new AuthService(prisma, passwords, tokens, notifications), withOrgContext };
}

describe('AuthService — Owner on organization registration (T-012b)', () => {
  it('creates the Owner role for the registrant within a single transaction', async () => {
    const tx = makeTx();
    const { service, withOrgContext } = makeService(tx);

    await service.registerOrganization({
      organizationName: 'Org',
      displayName: 'Rep',
      email: 'rep@test.local',
      password: 'password123',
    });

    expect(withOrgContext).toHaveBeenCalledTimes(1);
    expect(tx.organization.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.authCredential.create).toHaveBeenCalledTimes(1);
    expect(tx.userRole.create).toHaveBeenCalledTimes(1);
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: 'owner' }),
    });
  });

  it('does NOT assign a role when registering a Person', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.registerPerson({
      displayName: 'Persona',
      email: 'persona@test.local',
      password: 'password123',
    });

    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.userRole.create).not.toHaveBeenCalled();
  });

  it('rejects registration if the Owner role assignment fails (atomic rollback)', async () => {
    const tx = makeTx();
    tx.userRole.create.mockRejectedValueOnce(new Error('role insert failed'));
    const { service } = makeService(tx);

    await expect(
      service.registerOrganization({
        organizationName: 'Org',
        displayName: 'Rep',
        email: 'fail@test.local',
        password: 'password123',
      }),
    ).rejects.toThrow('role insert failed');
  });
});
