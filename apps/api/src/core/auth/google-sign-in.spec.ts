import type { ConfigService } from '@nestjs/config';
import type { IdentityClaims, IdentityPort } from '@adoptafacil/contracts';
import type { AuditService } from '../audit/audit.service';
import type { NotificationPort } from '../notifications/notification.port';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.validation';
import { AuthService } from './auth.service';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';

/**
 * Unit tests for Google Sign-In (T-Google-SignIn): auto-link by email to an
 * existing AuthCredential (whatever its original authProvider/accountType),
 * or — the first time — creation of a lightweight PERSON account (never an
 * Organization). Both paths end in the SAME `AuthSession` shape as password
 * login/register. The DB and IdentityPort are mocked; a real Google token is
 * never involved (unit-level, mirrors auth.service.spec.ts's style).
 */

interface TxMock {
  organization: { create: jest.Mock };
  user: { create: jest.Mock; findUnique: jest.Mock };
  authCredential: { create: jest.Mock };
}

function makeTx(profile: unknown = null): TxMock {
  return {
    organization: { create: jest.fn().mockResolvedValue({}) },
    user: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(profile),
    },
    authCredential: { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeService(opts: {
  existingCredential?: unknown;
  claims: IdentityClaims;
  profile?: unknown;
}): {
  service: AuthService;
  tx: TxMock;
  withOrgContext: jest.Mock;
  identity: { verifyGoogleIdToken: jest.Mock };
  tokens: { issueTokens: jest.Mock };
} {
  const tx = makeTx(opts.profile ?? null);
  const withOrgContext = jest
    .fn()
    .mockImplementation((_org: string, cb: (t: TxMock) => Promise<unknown>) => cb(tx));
  const prisma = {
    authCredential: {
      findUnique: jest.fn().mockResolvedValue(opts.existingCredential ?? null),
    },
    withOrgContext,
  } as unknown as PrismaService;
  const passwords = {
    hash: jest.fn().mockResolvedValue('random-hash'),
  } as unknown as PasswordService;
  const tokens = {
    issueTokens: jest.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
    }),
  };
  const notifications = { send: jest.fn() } as unknown as NotificationPort;
  const identity = { verifyGoogleIdToken: jest.fn().mockResolvedValue(opts.claims) };
  const audit = { record: jest.fn(), recordWithTx: jest.fn() } as unknown as AuditService;
  const config = {
    get: (key: string) => (key === 'WEB_BASE_URL' ? 'http://localhost:5173' : undefined),
  } as unknown as ConfigService<Env, true>;
  const service = new AuthService(
    prisma,
    passwords,
    tokens as unknown as TokenService,
    notifications,
    identity as unknown as IdentityPort,
    audit,
    config,
  );
  return { service, tx, withOrgContext, identity, tokens };
}

describe('AuthService.googleSignIn — new account (no existing AuthCredential)', () => {
  it('creates a lightweight PERSON account (never an Organization)', async () => {
    const claims: IdentityClaims = {
      email: 'Nueva@Example.com',
      name: 'Nueva Persona',
      emailVerified: true,
      sub: 'google-sub-1',
    };
    const { service, tx, tokens } = makeService({ existingCredential: null, claims });

    const session = await service.googleSignIn({ idToken: 'fake:nueva@example.com:Nueva Persona' });

    expect(session.user.email).toBe('nueva@example.com');
    expect(session.user.accountType).toBe('person');
    expect(tx.organization.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountType: 'person', email: 'nueva@example.com' }),
      }),
    );
    expect(tx.authCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountType: 'person',
          authProvider: 'google',
          googleSub: 'google-sub-1',
        }),
      }),
    );
    expect(tokens.issueTokens).toHaveBeenCalledWith(
      expect.objectContaining({ accountType: 'person' }),
    );
  });

  it('hashes a random, unguessable password — never anything derived from the token', async () => {
    const claims: IdentityClaims = {
      email: 'otra@example.com',
      name: 'Otra Persona',
      emailVerified: true,
      sub: 'google-sub-2',
    };
    const { service, tx } = makeService({ existingCredential: null, claims });

    await service.googleSignIn({ idToken: 'fake:otra@example.com:Otra Persona' });

    const createCall = tx.authCredential.create.mock.calls[0][0];
    expect(createCall.data.passwordHash).toBe('random-hash');
    expect(createCall.data.passwordHash).not.toContain('otra@example.com');
  });
});

describe('AuthService.googleSignIn — auto-link by email', () => {
  it('enters the EXISTING account regardless of its original authProvider/accountType', async () => {
    const claims: IdentityClaims = {
      email: 'existente@example.com',
      name: 'Nombre De Google',
      emailVerified: true,
      sub: 'google-sub-3',
    };
    const existingCredential = {
      userId: 'usr-1',
      organizationId: 'org-1',
      accountType: 'organization',
      email: 'existente@example.com',
      authProvider: 'password',
    };
    const { service, tx, tokens } = makeService({
      existingCredential,
      claims,
      profile: { displayName: 'Nombre Original', phone: null, documentId: null, address: null },
    });

    const session = await service.googleSignIn({
      idToken: 'fake:existente@example.com:Nombre De Google',
    });

    // Enters the SAME account (org account type preserved) — never mutated
    // into a Person, never a second account created.
    expect(session.user.id).toBe('usr-1');
    expect(session.user.organizationId).toBe('org-1');
    expect(session.user.accountType).toBe('organization');
    expect(session.user.displayName).toBe('Nombre Original');
    expect(tx.organization.create).not.toHaveBeenCalled();
    expect(tx.authCredential.create).not.toHaveBeenCalled();
    expect(tokens.issueTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-1',
        organizationId: 'org-1',
        accountType: 'organization',
      }),
    );
  });
});

describe('AuthService.googleSignIn — unverified email', () => {
  it('rejects BEFORE the auto-link lookup when Google reports emailVerified: false', async () => {
    // A malicious/misconfigured token claiming an unverified email must never
    // reach the AuthCredential lookup — otherwise it becomes a way to log into
    // ANY existing account just by knowing its email address.
    const claims: IdentityClaims = {
      email: 'victima@example.com',
      name: 'Atacante',
      emailVerified: false,
      sub: 'google-sub-unverified',
    };
    const existingCredential = {
      userId: 'usr-victim',
      organizationId: 'org-victim',
      accountType: 'organization',
      email: 'victima@example.com',
      authProvider: 'password',
    };
    const { service, tx } = makeService({ existingCredential, claims });

    await expect(service.googleSignIn({ idToken: 'irrelevant-mocked-token' })).rejects.toThrow(
      'not verified',
    );

    expect(tx.authCredential.create).not.toHaveBeenCalled();
  });
});
