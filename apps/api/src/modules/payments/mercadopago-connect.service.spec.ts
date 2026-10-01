import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../../core/audit/audit.service';
import type { MercadoPagoOAuthClient } from '../../core/payments/mercadopago-oauth.client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { MercadoPagoConnectService } from './mercadopago-connect.service';

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    MERCADOPAGO_TOKEN_REFRESH_WINDOW_DAYS: 15,
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

function makeAudit(): AuditService {
  return { recordWithTx: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
}

describe('MercadoPagoConnectService — state JWT (T-OAuth-Connect)', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const tenant = new TenantContextService();

  function makeService(
    overrides: {
      oauth?: Partial<MercadoPagoOAuthClient>;
      prisma?: Partial<PrismaService>;
      audit?: AuditService;
      config?: ConfigService<Env, true>;
      jwtOverride?: JwtService;
    } = {},
  ): MercadoPagoConnectService {
    return new MercadoPagoConnectService(
      overrides.jwtOverride ?? jwt,
      overrides.config ?? makeConfig(),
      (overrides.prisma ?? {}) as PrismaService,
      tenant,
      overrides.audit ?? makeAudit(),
      (overrides.oauth ?? {}) as MercadoPagoOAuthClient,
    );
  }

  it('a valid state round-trips to the SAME organizationId it was minted for', async () => {
    const buildAuthorizeUrl = jest.fn((state: string) => `https://mp.test/auth?state=${state}`);
    const service = makeService({ oauth: { buildAuthorizeUrl } });

    const { authorizeUrl } = tenant.run({ organizationId: 'org-1' }, () => service.getConnectUrl());
    const state = new URL(authorizeUrl).searchParams.get('state')!;
    expect(state).toBeTruthy();

    const exchangeCode = jest.fn().mockResolvedValue({
      access_token: 'acc',
      refresh_token: 'ref',
      user_id: 999,
      expires_in: 100,
    });
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      withOrgContext: jest.fn((_organizationId: string, fn: (tx: unknown) => unknown) =>
        fn({
          organizationMercadoPagoAccount: { upsert },
          $executeRaw: jest.fn(),
        }),
      ),
    } as unknown as PrismaService;
    const service2 = makeService({ oauth: { buildAuthorizeUrl, exchangeCode }, prisma });
    // Re-derive state from a service that shares the same jwt secret (state was
    // signed above using the shared `jwt` instance).
    const result = await service2.handleCallback('the-code', state);
    expect(result.organizationId).toBe('org-1');
    expect(exchangeCode).toHaveBeenCalledWith('the-code', state);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1' },
        create: expect.objectContaining({ organizationId: 'org-1', mpUserId: '999' }),
      }),
    );
  });

  it('rejects a TAMPERED state (payload/signature mismatch) — never trusts it unverified', async () => {
    const buildAuthorizeUrl = jest.fn((state: string) => `https://mp.test/auth?state=${state}`);
    const service = makeService({ oauth: { buildAuthorizeUrl } });
    const { authorizeUrl } = tenant.run({ organizationId: 'org-1' }, () => service.getConnectUrl());
    const state = new URL(authorizeUrl).searchParams.get('state')!;
    const tampered = state.slice(0, -2) + (state.slice(-2) === 'aa' ? 'bb' : 'aa');

    await expect(service.handleCallback('code', tampered)).rejects.toThrow(UnauthorizedException);
  });

  it("rejects an EXPIRED state — the 10-minute TTL matching MercadoPago's own code window", async () => {
    // A JwtService signing with an already-past expiry.
    const expiredJwt = new JwtService({ secret: 'test-secret' });
    const expiredState = expiredJwt.sign(
      { organizationId: 'org-1', nonce: 'n' },
      { expiresIn: -1 },
    );
    const service = makeService({ jwtOverride: expiredJwt });

    await expect(service.handleCallback('code', expiredState)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a state signed with a DIFFERENT secret', async () => {
    const otherJwt = new JwtService({ secret: 'other-secret' });
    const foreignState = otherJwt.sign({ organizationId: 'org-1', nonce: 'n' });
    const service = makeService();

    await expect(service.handleCallback('code', foreignState)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('MercadoPagoConnectService — refreshDueAccounts batch (T-OAuth-Connect)', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const tenant = new TenantContextService();

  it('refreshes candidates within the window, skips one further out, and one failure does not stop the batch', async () => {
    const now = new Date('2026-09-30T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    try {
      const rows = [
        {
          id: 'a1',
          organization_id: 'org-due-1',
          refresh_token: 'r1',
          expires_at: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), // due
        },
        {
          id: 'a2',
          organization_id: 'org-due-2-fails',
          refresh_token: 'r2',
          expires_at: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // due
        },
        {
          id: 'a3',
          organization_id: 'org-far',
          refresh_token: 'r3',
          expires_at: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), // NOT due
        },
      ];
      const $queryRaw = jest.fn().mockResolvedValue(rows);
      const update = jest.fn().mockResolvedValue({});
      const withOrgContext = jest.fn((_organizationId: string, fn: (tx: unknown) => unknown) =>
        fn({ organizationMercadoPagoAccount: { update } }),
      );
      const prisma = { $queryRaw, withOrgContext } as unknown as PrismaService;

      const refreshToken = jest.fn((token: string) => {
        if (token === 'r2') {
          return Promise.reject(new Error('MercadoPago said no'));
        }
        return Promise.resolve({ access_token: 'new-acc', refresh_token: 'new-ref' });
      });
      const oauth = { refreshToken } as unknown as MercadoPagoOAuthClient;
      const audit = makeAudit();

      const service = new MercadoPagoConnectService(
        jwt,
        makeConfig(),
        prisma,
        tenant,
        audit,
        oauth,
      );

      await service.refreshDueAccounts();

      // Both DUE rows attempted...
      expect(refreshToken).toHaveBeenCalledWith('r1');
      expect(refreshToken).toHaveBeenCalledWith('r2');
      // ...the far-out row never attempted.
      expect(refreshToken).not.toHaveBeenCalledWith('r3');

      // Only the SUCCESSFUL refresh persisted a DB update.
      expect(update).toHaveBeenCalledTimes(1);
      expect(withOrgContext).toHaveBeenCalledWith('org-due-1', expect.any(Function));
      expect(withOrgContext).not.toHaveBeenCalledWith('org-due-2-fails', expect.any(Function));
      expect(withOrgContext).not.toHaveBeenCalledWith('org-far', expect.any(Function));
    } finally {
      jest.useRealTimers();
    }
  });
});
