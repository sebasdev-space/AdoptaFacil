import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@adoptafacil/contracts';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';
import { RolesGuard } from './roles.guard';

function makeContext(user: RequestUser | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeReflector(required: Role[] | undefined): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
}

function makePrisma(heldRoles: string[]): PrismaService {
  return {
    withTenant: jest.fn().mockResolvedValue(heldRoles.map((role) => ({ role }))),
  } as unknown as PrismaService;
}

const USER: RequestUser = {
  id: 'u1',
  organizationId: 'o1',
  accountType: 'organization',
  email: 'u1@test',
};

describe('RolesGuard', () => {
  it('allows when no roles are required (no restriction)', async () => {
    const prisma = makePrisma([]);
    const guard = new RolesGuard(makeReflector(undefined), prisma);
    await expect(guard.canActivate(makeContext(USER))).resolves.toBe(true);
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('allows when the user holds one of the required roles', async () => {
    const guard = new RolesGuard(
      makeReflector([Role.Owner, Role.Administrator]),
      makePrisma(['administrator']),
    );
    await expect(guard.canActivate(makeContext(USER))).resolves.toBe(true);
  });

  it('denies (403) when the user lacks every required role', async () => {
    const guard = new RolesGuard(makeReflector([Role.Owner]), makePrisma(['operator']));
    await expect(guard.canActivate(makeContext(USER))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies (403) when there is no authenticated principal', async () => {
    const guard = new RolesGuard(makeReflector([Role.Owner]), makePrisma(['owner']));
    await expect(guard.canActivate(makeContext(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('denies (403) when the user holds no roles at all', async () => {
    const guard = new RolesGuard(makeReflector([Role.ReadOnlyAuditor]), makePrisma([]));
    await expect(guard.canActivate(makeContext(USER))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
