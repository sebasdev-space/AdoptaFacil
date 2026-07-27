import { createHash } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { AuditService } from '../audit/audit.service';
import type { NotificationPort } from '../notifications/notification.port';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env.validation';
import { AuthService } from './auth.service';
import type { PasswordService } from './password.service';
import type { TokenService } from './token.service';

const WEB_BASE_URL = 'http://localhost:5173';

interface TxMock {
  passwordResetToken: { create: jest.Mock; updateMany: jest.Mock };
  authCredential: { update: jest.Mock };
  refreshToken: { updateMany: jest.Mock };
}

function makeTx(claimCount = 1): TxMock {
  return {
    passwordResetToken: {
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
    },
    authCredential: { update: jest.fn().mockResolvedValue({}) },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
}

interface Harness {
  service: AuthService;
  tx: TxMock;
  prisma: {
    authCredential: { findUnique: jest.Mock };
    passwordResetToken: { findUnique: jest.Mock };
    withOrgContext: jest.Mock;
  };
  audit: { recordWithTx: jest.Mock };
  notifications: { send: jest.Mock };
  passwords: { hash: jest.Mock };
}

function makeService(opts: {
  credential?: unknown;
  resetToken?: unknown;
  claimCount?: number;
}): Harness {
  const tx = makeTx(opts.claimCount ?? 1);
  const prisma = {
    authCredential: { findUnique: jest.fn().mockResolvedValue(opts.credential ?? null) },
    passwordResetToken: { findUnique: jest.fn().mockResolvedValue(opts.resetToken ?? null) },
    withOrgContext: jest
      .fn()
      .mockImplementation((_org: string, cb: (t: TxMock) => Promise<unknown>) => cb(tx)),
  };
  const passwords = { hash: jest.fn().mockResolvedValue('new-hash') };
  const tokens = {} as unknown as TokenService;
  const notifications = { send: jest.fn().mockResolvedValue(undefined) };
  const audit = { recordWithTx: jest.fn().mockResolvedValue({}) };
  const config = {
    get: (key: string) => (key === 'WEB_BASE_URL' ? WEB_BASE_URL : undefined),
  } as unknown as ConfigService<Env, true>;
  const service = new AuthService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    tokens,
    notifications as unknown as NotificationPort,
    audit as unknown as AuditService,
    config,
  );
  return { service, tx, prisma, audit, notifications, passwords };
}

const CREDENTIAL = { userId: 'user-1', organizationId: 'org-1', email: 'user@test.local' };
const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

describe('AuthService.requestPasswordReset (T-110)', () => {
  it('does nothing (no create, no email) for an unknown email — no enumeration', async () => {
    const h = makeService({ credential: null });
    await h.service.requestPasswordReset('nobody@test.local');
    expect(h.prisma.withOrgContext).not.toHaveBeenCalled();
    expect(h.notifications.send).not.toHaveBeenCalled();
  });

  it('creates a token, audits the request, and emails a clickable reset link', async () => {
    const h = makeService({ credential: CREDENTIAL });
    await h.service.requestPasswordReset('user@test.local');

    expect(h.tx.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(h.audit.recordWithTx).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({ action: 'password_reset.requested', actorUserId: 'user-1' }),
    );
    const message = h.notifications.send.mock.calls[0][0] as { to: string; body: string };
    expect(message.to).toBe('user@test.local');
    expect(message.body).toContain(`${WEB_BASE_URL}/reset-password?token=`);
    // The token stored in the DB is a SHA-256 hash, never the raw token.
    const storedHash = (
      h.tx.passwordResetToken.create.mock.calls[0][0] as {
        data: { tokenHash: string };
      }
    ).data.tokenHash;
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    // The raw token in the link is NOT what is persisted (take up to whitespace).
    const rawToken = message.body.split('token=')[1].split(/\s/)[0];
    expect(storedHash).not.toBe(rawToken);
    expect(createHash('sha256').update(rawToken).digest('hex')).toBe(storedHash);
  });
});

describe('AuthService.confirmPasswordReset (T-110)', () => {
  it('rejects an unknown token generically (no org context touched)', async () => {
    const h = makeService({ resetToken: null });
    await expect(h.service.confirmPasswordReset('bad', 'newpassword123')).rejects.toThrow(
      /invalid or expired/i,
    );
    expect(h.prisma.withOrgContext).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const h = makeService({
      resetToken: { id: 't1', userId: 'user-1', usedAt: null, expiresAt: past() },
    });
    await expect(h.service.confirmPasswordReset('tok', 'newpassword123')).rejects.toThrow(
      /invalid or expired/i,
    );
    expect(h.prisma.withOrgContext).not.toHaveBeenCalled();
  });

  it('rejects an already-used token', async () => {
    const h = makeService({
      resetToken: { id: 't1', userId: 'user-1', usedAt: new Date(), expiresAt: future() },
    });
    await expect(h.service.confirmPasswordReset('tok', 'newpassword123')).rejects.toThrow(
      /invalid or expired/i,
    );
  });

  it('rejects when the token is claimed concurrently (single-use race)', async () => {
    const h = makeService({
      resetToken: { id: 't1', userId: 'user-1', usedAt: null, expiresAt: future() },
      credential: CREDENTIAL,
      claimCount: 0,
    });
    await expect(h.service.confirmPasswordReset('tok', 'newpassword123')).rejects.toThrow(
      /invalid or expired/i,
    );
    // It reached the transaction but did NOT rewrite the password.
    expect(h.tx.authCredential.update).not.toHaveBeenCalled();
  });

  it('sets the new password, marks the token used, revokes sessions, and audits', async () => {
    const h = makeService({
      resetToken: { id: 't1', userId: 'user-1', usedAt: null, expiresAt: future() },
      credential: CREDENTIAL,
    });
    await h.service.confirmPasswordReset('tok', 'newpassword123');

    expect(h.passwords.hash).toHaveBeenCalledWith('newpassword123');
    expect(h.tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(h.tx.authCredential.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { passwordHash: 'new-hash' },
    });
    expect(h.tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(h.audit.recordWithTx).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({ action: 'password_reset.completed', actorUserId: 'user-1' }),
    );
  });
});
