import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormalizationState } from '@adoptafacil/contracts';
import { SessionProvider, useSession } from '../auth';
import type { AuthApi, AuthSession } from '../api';
import { deriveTransparencyStatus, SessionTransparencyProvider } from './transparency-context';
import { TransparencyIndicator } from './transparency-indicator';

/**
 * T-029 — the shell's authenticated transparency indicator is wired to REAL data
 * derived from the `org` contract, loaded ONCE per session (never per render),
 * and hidden for accounts with no org transparency.
 */

describe('deriveTransparencyStatus (pure mapping)', () => {
  it('hides the indicator with no session', () => {
    expect(
      deriveTransparencyStatus({ authenticated: false, sourceStatus: 'idle', source: null }),
    ).toEqual({
      status: 'hidden',
    });
  });

  it('hides it for an authenticated account with no org source (idle)', () => {
    expect(
      deriveTransparencyStatus({ authenticated: true, sourceStatus: 'idle', source: null }),
    ).toEqual({
      status: 'hidden',
    });
  });

  it('reflects loading and error states', () => {
    expect(
      deriveTransparencyStatus({ authenticated: true, sourceStatus: 'loading', source: null })
        .status,
    ).toBe('loading');
    expect(
      deriveTransparencyStatus({ authenticated: true, sourceStatus: 'error', source: null }).status,
    ).toBe('error');
  });

  it('derives REAL level and % when the source is ready', () => {
    const state = deriveTransparencyStatus({
      authenticated: true,
      sourceStatus: 'ready',
      source: {
        verificationLevel: { level: 2, criteria: [] },
        formalizationState: FormalizationState.ESAL,
      },
    });
    expect(state).toEqual({
      status: 'ready',
      data: { level: 2, formalizationPct: 75, accountability: 'no-disponible' },
    });
  });
});

// --- Session integration: one load per session, real values, gating ----------

const TOKENS = {
  accessToken: 'a',
  refreshToken: 'r',
  tokenType: 'Bearer' as const,
  expiresIn: 900,
};

function fakeAuthApi(accountType: 'organization' | 'person'): AuthApi {
  const session: AuthSession = {
    user: {
      id: 'u1',
      email: 'demo@adoptafacil.local',
      displayName: 'Demo',
      accountType,
      organizationId: 'org1',
    },
    tokens: TOKENS,
  };
  return {
    login: async () => session,
    register: async () => session,
    requestPasswordReset: async () => {},
    refresh: async () => TOKENS,
    logout: async () => {},
    me: async () => session.user,
    myRoles: async () => [],
  };
}

/** Counting fetch for the org transparency endpoints. */
function orgFetch() {
  const calls: Record<string, number> = {};
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const path = url.includes('/org/documents/verification')
      ? '/org/documents/verification'
      : url.includes('/org/formalization')
        ? '/org/formalization'
        : url;
    calls[path] = (calls[path] ?? 0) + 1;
    const body =
      path === '/org/formalization'
        ? { state: FormalizationState.ESAL, rteVigente: false }
        : path === '/org/documents/verification'
          ? { level: 2, criteria: [] }
          : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function SignInOnMount() {
  const { signIn } = useSession();
  useEffect(() => {
    void signIn({ email: 'demo@adoptafacil.local', password: 'x' });
  }, [signIn]);
  return (
    <SessionTransparencyProvider>
      <TransparencyIndicator />
    </SessionTransparencyProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('SessionTransparencyProvider (T-029)', () => {
  it('loads the source ONCE per session and shows real derived level/%', async () => {
    const { fn, calls } = orgFetch();
    const { rerender } = render(
      <SessionProvider mode="http" authApi={fakeAuthApi('organization')} fetchFn={fn}>
        <SignInOnMount />
      </SessionProvider>,
    );

    const indicator = await screen.findByTestId('transparency-indicator');
    await waitFor(() => expect(indicator).toHaveTextContent('75%'));
    expect(indicator).toHaveTextContent('Nivel');
    expect(indicator).toHaveTextContent('2');

    // Exactly one fetch per endpoint for the whole session (not per render).
    expect(calls['/org/formalization']).toBe(1);
    expect(calls['/org/documents/verification']).toBe(1);

    // Re-rendering the tree must not trigger any further fetch.
    rerender(
      <SessionProvider mode="http" authApi={fakeAuthApi('organization')} fetchFn={fn}>
        <SignInOnMount />
      </SessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('transparency-indicator')).toHaveTextContent('75%'),
    );
    expect(calls['/org/formalization']).toBe(1);
    expect(calls['/org/documents/verification']).toBe(1);
  });

  it('hides the indicator (and fetches no org data) for a person account', async () => {
    const { fn, calls } = orgFetch();
    render(
      <SessionProvider mode="http" authApi={fakeAuthApi('person')} fetchFn={fn}>
        <SignInOnMount />
      </SessionProvider>,
    );

    // Give the session time to establish; a person account never loads org data.
    await waitFor(() =>
      expect(screen.queryByTestId('transparency-indicator')).not.toBeInTheDocument(),
    );
    expect(calls['/org/formalization']).toBeUndefined();
    expect(calls['/org/documents/verification']).toBeUndefined();
  });
});
