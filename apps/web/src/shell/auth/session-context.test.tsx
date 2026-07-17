import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
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
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
  });
});

describe('logout redirects protected routes', () => {
  it('sends the user to /login after signing out', async () => {
    const user = userEvent.setup();
    // Bootstrap an authenticated session inside the real shell.
    renderShell({ route: '/adopciones', session: { initialStatus: 'authenticated' } });
    expect(screen.getByRole('heading', { name: 'Adopciones' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    // The guard now sees no session and redirects to the public login route.
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });
});
