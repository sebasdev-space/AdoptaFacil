import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { MockAuthApi } from '../api';
import { SessionProvider, useSession } from './session-context';
import { renderShell } from '../../test-utils';

function Consumer() {
  const { status, user, signIn, signOut } = useSession();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.name ?? '—'}</p>
      <button onClick={() => void signIn()}>demo-signin</button>
      <button onClick={() => void signIn({ email: 'demo@adoptafacil.org', password: 'demo' })}>
        creds-signin
      </button>
      <button onClick={() => void signOut()}>signout</button>
    </div>
  );
}

describe('SessionProvider — session state without browser storage', () => {
  let setItem: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setItem = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts unauthenticated by default', () => {
    render(
      <SessionProvider authApi={new MockAuthApi()}>
        <Consumer />
      </SessionProvider>,
    );
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('—');
  });

  it('authenticates on sign-in and clears on sign-out, touching no storage', async () => {
    const user = userEvent.setup();
    render(
      <SessionProvider authApi={new MockAuthApi()}>
        <Consumer />
      </SessionProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'demo-signin' }));
    // establish() now awaits the roles round-trip before flipping to authenticated.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('user')).toHaveTextContent('Equipo AdoptaFácil');

    await user.click(screen.getByRole('button', { name: 'signout' }));
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('user')).toHaveTextContent('—');

    // Non-negotiable: nothing was written to browser storage.
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('passes real credentials through to the auth service', async () => {
    // The mock seeds a demo account; sign in with those exact credentials.
    const authApi = new MockAuthApi();
    const loginSpy = vi.spyOn(authApi, 'login');
    const user = userEvent.setup();

    render(
      <SessionProvider authApi={authApi}>
        <Consumer />
      </SessionProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'creds-signin' }));
    expect(loginSpy).toHaveBeenCalledWith({ email: 'demo@adoptafacil.org', password: 'demo' });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
  });
});

/** A `fetchFn` that routes by pathname to a canned JSON body, for the http-mode bootstrap tests. */
function routedFetch(responses: Record<string, unknown>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = new URL(url).pathname;
    if (!(path in responses)) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(responses[path]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('SessionProvider — bootstrap silencioso desde la cookie httpOnly (T-session-persistence)', () => {
  it('restaura la sesión al montar usando SOLO el refresh silencioso, sin pasar por signIn', async () => {
    const tokens = {
      accessToken: 'acc-1',
      refreshToken: 'ref-1',
      tokenType: 'Bearer',
      expiresIn: 900,
    };
    const user = {
      id: 'u1',
      email: 'demo@adoptafacil.org',
      displayName: 'Demo Restaurado',
      accountType: 'person',
      organizationId: 'org-1',
    };
    const fetchFn = routedFetch({
      '/auth/refresh/silent': tokens,
      '/auth/me': user,
      '/rbac/my-roles': [],
    });

    render(
      <SessionProvider mode="http" fetchFn={fetchFn}>
        <Consumer />
      </SessionProvider>,
    );

    // Arranca en 'loading' (no en 'unauthenticated') mientras el bootstrap corre.
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('user')).toHaveTextContent('Demo Restaurado');
  });

  it('sin cookie válida (refresh/silent → null) cae a unauthenticated, nunca a un error', async () => {
    const fetchFn = routedFetch({ '/auth/refresh/silent': null });

    render(
      <SessionProvider mode="http" fetchFn={fetchFn}>
        <Consumer />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(screen.getByTestId('user')).toHaveTextContent('—');
  });

  it('con authApi inyectado explícitamente (fakes de test), NO intenta el bootstrap y arranca unauthenticated', () => {
    // Mismo caso que el resto de la suite: pasar un authApi (aunque sea con
    // mode="http") es la señal de "esto es un test", no la app real.
    render(
      <SessionProvider mode="http" authApi={new MockAuthApi()}>
        <Consumer />
      </SessionProvider>,
    );
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });
});

describe('logout redirects protected routes', () => {
  it('sends the user to /login after signing out', async () => {
    const user = userEvent.setup();
    // Bootstrap an authenticated session inside the real shell. "/adopciones" is
    // role-gated at the route level (F1-02), so this needs an eval role explicitly —
    // the default mock session carries none.
    renderShell({
      route: '/adopciones',
      session: {
        initialStatus: 'authenticated',
        initialUser: {
          id: 'usr_mock_1',
          name: 'Equipo AdoptaFácil',
          email: 'equipo@adoptafacil.org',
          roles: [Role.Owner],
          organizationId: 'org_mock_1',
          accountType: 'organization',
        },
      },
    });
    expect(screen.getByRole('heading', { name: 'Adopciones' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    // The guard now sees no session and redirects to the public login route.
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });
});
