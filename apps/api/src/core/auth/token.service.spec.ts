import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthConfig } from './auth.config';
import { TokenService } from './token.service';

const CONFIG: AuthConfig = {
  jwtSecret: 'test-secret',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 604800,
};

function makeJwt(): JwtService {
  return { sign: jest.fn().mockReturnValue('signed.access.token') } as unknown as JwtService;
}

function makePrisma(): PrismaService {
  return {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    authCredential: { findUnique: jest.fn() },
  } as unknown as PrismaService;
}

describe('TokenService', () => {
  it('issues an access JWT plus an opaque refresh token stored only as a hash', async () => {
    const jwt = makeJwt();
    const prisma = makePrisma();
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'r1' });
    const service = new TokenService(jwt, prisma, CONFIG);

    const tokens = await service.issueTokens({
      userId: 'u1',
      organizationId: 'o1',
      accountType: 'person',
      email: 'e@test',
    });

    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresIn).toBe(900);
    expect(tokens.accessToken).toBe('signed.access.token');
    expect(tokens.refreshToken.length).toBeGreaterThan(20);

    const createArg = (prisma.refreshToken.create as jest.Mock).mock.calls[0][0];
    // The stored value is a hash — never the raw refresh token.
    expect(createArg.data.tokenHash).not.toBe(tokens.refreshToken);
    expect(createArg.data.userId).toBe('u1');
  });

  it('rotates a valid refresh token: creates a replacement and revokes the old one', async () => {
    const jwt = makeJwt();
    const prisma = makePrisma();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'old',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prisma.authCredential.findUnique as jest.Mock).mockResolvedValue({
      userId: 'u1',
      organizationId: 'o1',
      accountType: 'person',
      email: 'e@test',
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'new' });
    const service = new TokenService(jwt, prisma, CONFIG);

    const tokens = await service.rotate('presented-refresh');

    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'old' },
      data: expect.objectContaining({ replacedById: 'new' }),
    });
    expect(tokens.accessToken).toBe('signed.access.token');
    expect(tokens.refreshToken).toEqual(expect.any(String));
  });

  it('rejects an unknown refresh token', async () => {
    const prisma = makePrisma();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new TokenService(makeJwt(), prisma, CONFIG);
    await expect(service.rotate('nope')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an already-revoked refresh token', async () => {
    const prisma = makePrisma();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'old',
      userId: 'u1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const service = new TokenService(makeJwt(), prisma, CONFIG);
    await expect(service.rotate('revoked')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired refresh token', async () => {
    const prisma = makePrisma();
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'old',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
    });
    const service = new TokenService(makeJwt(), prisma, CONFIG);
    await expect(service.rotate('expired')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
