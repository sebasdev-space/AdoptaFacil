import type { RequestUser } from './auth.types';
import type { PrismaService } from '../../prisma/prisma.service';
import { IncompleteProfileException, requireCompleteProfile } from './require-complete-profile';

/**
 * Unit tests for the shared profile-completion gate (T-Google-SignIn, business
 * rule #3), reused verbatim by donations/sponsorships, adoption requests and
 * volunteer enrollment so the rule — and its exact 422 shape — lives in ONE
 * place. Scoped to accountType 'person' — an Organization actor must NEVER
 * be blocked by this (some endpoints let an org's own token hit these routes
 * for OTHER checks, e.g. the adoption conflict-of-interest 403).
 */

function actor(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'user-1',
    organizationId: 'org-1',
    accountType: 'person',
    email: 'person@example.com',
    ...overrides,
  };
}

function makePrisma(profile: unknown): { prisma: PrismaService; withOrgContext: jest.Mock } {
  const withOrgContext = jest
    .fn()
    .mockImplementation((_org: string, cb: (tx: unknown) => unknown) =>
      cb({ user: { findUnique: jest.fn().mockResolvedValue(profile) } }),
    );
  return { prisma: { withOrgContext } as unknown as PrismaService, withOrgContext };
}

describe('requireCompleteProfile', () => {
  it('resolves silently when phone/documentId/address are all set', async () => {
    const { prisma } = makePrisma({
      phone: '3001234567',
      documentId: '1000000000',
      address: 'Calle 1 #2-3, Bogotá',
    });
    await expect(requireCompleteProfile(prisma, actor())).resolves.toBeUndefined();
  });

  it('throws IncompleteProfileException listing every missing field, in order', async () => {
    const { prisma } = makePrisma({ phone: null, documentId: '1000000000', address: null });
    const error = await requireCompleteProfile(prisma, actor()).catch((e) => e);
    expect(error).toBeInstanceOf(IncompleteProfileException);
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toEqual({
      error: 'INCOMPLETE_PROFILE',
      missing: ['phone', 'address'],
    });
  });

  it('treats an empty string the same as missing', async () => {
    const { prisma } = makePrisma({ phone: '', documentId: '1000000000', address: 'Some address' });
    const error = await requireCompleteProfile(prisma, actor()).catch((e) => e);
    expect(error).toBeInstanceOf(IncompleteProfileException);
    expect(error.getResponse()).toEqual({ error: 'INCOMPLETE_PROFILE', missing: ['phone'] });
  });

  it('treats a missing user row (null profile) as every field missing', async () => {
    const { prisma } = makePrisma(null);
    const error = await requireCompleteProfile(prisma, actor()).catch((e) => e);
    expect(error).toBeInstanceOf(IncompleteProfileException);
    expect(error.getResponse()).toEqual({
      error: 'INCOMPLETE_PROFILE',
      missing: ['phone', 'documentId', 'address'],
    });
  });

  it('reads the profile under the ACTOR organization context (never a different org)', async () => {
    const { prisma, withOrgContext } = makePrisma({
      phone: '1',
      documentId: '1',
      address: '1',
    });
    await requireCompleteProfile(prisma, actor({ organizationId: 'org-actor' }));
    expect(withOrgContext).toHaveBeenCalledWith('org-actor', expect.any(Function));
  });

  it('is a no-op for an Organization account (never gated by this rule)', async () => {
    const { prisma, withOrgContext } = makePrisma(null);
    await expect(
      requireCompleteProfile(prisma, actor({ accountType: 'organization' })),
    ).resolves.toBeUndefined();
    expect(withOrgContext).not.toHaveBeenCalled();
  });
});
