import type { ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims } from '@adoptafacil/contracts';
import type { AuthenticatedRequest } from './auth.types';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

const CLAIMS: AccessTokenClaims = {
  sub: 'u1',
  org: 'o1',
  typ: 'person',
  email: 'donor@test.dev',
};

function makeContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeRequest(authorization?: string): AuthenticatedRequest {
  return { headers: { authorization } } as unknown as AuthenticatedRequest;
}

/**
 * Guest-checkout guard (client requirement: donating must never require an
 * account/login). Unlike `JwtAuthGuard`, `canActivate` NEVER throws — it just
 * attaches `request.user` when (and only when) a valid bearer token is
 * present, so an authenticated donor still gets linked to their account while
 * a guest proceeds with no `request.user` at all.
 */
describe('OptionalJwtAuthGuard', () => {
  it('sets request.user and allows the request when the bearer token is valid', () => {
    const verify = jest.fn().mockReturnValue(CLAIMS);
    const jwt = { verify } as unknown as JwtService;
    const guard = new OptionalJwtAuthGuard(jwt);
    const request = makeRequest('Bearer good-token');

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(verify).toHaveBeenCalledWith('good-token');
    expect(request.user).toEqual({
      id: 'u1',
      organizationId: 'o1',
      accountType: 'person',
      email: 'donor@test.dev',
    });
  });

  it('allows the request with no request.user when there is no Authorization header (guest)', () => {
    const verify = jest.fn();
    const jwt = { verify } as unknown as JwtService;
    const guard = new OptionalJwtAuthGuard(jwt);
    const request = makeRequest(undefined);

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(verify).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('allows the request with no request.user when the header is not a Bearer token (guest)', () => {
    const verify = jest.fn();
    const jwt = { verify } as unknown as JwtService;
    const guard = new OptionalJwtAuthGuard(jwt);
    const request = makeRequest('Basic abc123');

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(verify).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('allows the request with no request.user (never throws) when the token is invalid/expired', () => {
    const verify = jest.fn().mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const jwt = { verify } as unknown as JwtService;
    const guard = new OptionalJwtAuthGuard(jwt);
    const request = makeRequest('Bearer expired-token');

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });
});
