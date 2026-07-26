import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders } from '../app-providers';
import { AppRoutes } from './routes';
import { renderShell } from '../../test-utils';

// Home page hits /health on mount; stub fetch so the shell renders offline.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', db: 'up', redis: 'up' }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('routing — public vs protected', () => {
  it('renders the public /login route without a session', () => {
    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated' } });
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor from a protected route to /login', () => {
    renderShell({ route: '/', session: { initialStatus: 'unauthenticated' } });
    // Landed on the login page instead of the protected home.
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Inicio' })).not.toBeInTheDocument();
  });

  it('shows a loading state while the session is resolving', () => {
    renderShell({ route: '/', session: { initialStatus: 'loading' } });
    expect(screen.getByText('Verificando tu sesión…')).toBeInTheDocument();
  });

  it('renders the protected home inside the shell when authenticated', async () => {
    renderShell({ route: '/', session: { initialStatus: 'authenticated' } });
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    // Sidebar navigation is present.
    expect(screen.getByRole('link', { name: 'Adopciones' })).toBeInTheDocument();
    // Flush the /health fetch so the state update settles inside act().
    expect(await screen.findByText('status')).toBeInTheDocument();
  });

  it('renders a protected module route when authenticated', () => {
    renderShell({ route: '/adopciones', session: { initialStatus: 'authenticated' } });
    expect(screen.getByRole('heading', { name: 'Adopciones' })).toBeInTheDocument();
  });

  it('renders the 404 page for unknown routes inside the shell', () => {
    renderShell({ route: '/ruta-inexistente', session: { initialStatus: 'authenticated' } });
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

  it('renders the donation flow for an authenticated visitor with the org resolved by query (T-051)', async () => {
    renderShell({
      route: '/donaciones?organizationId=org-9&organizationName=Refugio%20Patitas',
      session: { initialStatus: 'authenticated' },
    });
    expect(await screen.findByRole('heading', { name: 'Donar' })).toBeInTheDocument();
    // Org resolved from the query → shown; NOT the "choose an org" empty state.
    expect(screen.getByText('Refugio Patitas')).toBeInTheDocument();
    expect(screen.queryByText('Elige una organización desde su portal')).not.toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor from /donaciones to login (deny-by-default, T-051)', () => {
    renderShell({
      route: '/donaciones?organizationId=org-9&organizationName=Refugio%20Patitas',
      session: { initialStatus: 'unauthenticated' },
    });
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Donar' })).not.toBeInTheDocument();
  });

  it('after signing in, returns to the donation flow with the org preserved (returnTo + query, T-051)', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders session={{ initialStatus: 'unauthenticated' }}>
        <MemoryRouter
          initialEntries={['/donaciones?organizationId=org-9&organizationName=Refugio%20Patitas']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AppRoutes />
        </MemoryRouter>
      </AppProviders>,
    );
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Correo electrónico'), 'demo@adoptafacil.org');
    await user.type(screen.getByLabelText('Contraseña'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    // Back on the donate flow, org intact (the query survived login).
    expect(await screen.findByRole('heading', { name: 'Donar' })).toBeInTheDocument();
    expect(screen.getByText('Refugio Patitas')).toBeInTheDocument();
  });

  // The "Solicitar adopción" CTA of the public animal detail (T-052) targets this URL.
  const REQUEST_URL =
    '/adopciones/solicitar?organizationId=org-1&animalId=a1&name=Firulais&species=dog';

  it('lets an authenticated visitor reach the adoption-request flow for the animal (T-052)', async () => {
    renderShell({ route: REQUEST_URL, session: { initialStatus: 'authenticated' } });
    expect(await screen.findByRole('heading', { name: 'Solicitar adopción' })).toBeInTheDocument();
    // Animal resolved from the query → its name is shown (not the "choose an animal" state).
    expect(screen.getByText('Firulais')).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor from "Solicitar adopción" to login (deny-by-default, T-052)', () => {
    renderShell({ route: REQUEST_URL, session: { initialStatus: 'unauthenticated' } });
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Solicitar adopción' })).not.toBeInTheDocument();
  });

  it('after signing in, returns to the adoption-request flow with the animal preserved (returnTo, T-052)', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders session={{ initialStatus: 'unauthenticated' }}>
        <MemoryRouter
          initialEntries={[REQUEST_URL]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AppRoutes />
        </MemoryRouter>
      </AppProviders>,
    );
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Correo electrónico'), 'demo@adoptafacil.org');
    await user.type(screen.getByLabelText('Contraseña'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    // Back on the request flow, the animal survived login (query preserved).
    expect(await screen.findByRole('heading', { name: 'Solicitar adopción' })).toBeInTheDocument();
    expect(screen.getByText('Firulais')).toBeInTheDocument();
  });

  it('after signing in from /login, returns to the originally requested route', async () => {
    const user = userEvent.setup();
    // Start unauthenticated, deep-link to a protected route → bounced to /login.
    render(
      <AppProviders session={{ initialStatus: 'unauthenticated' }}>
        <MemoryRouter
          initialEntries={['/adopciones']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AppRoutes />
        </MemoryRouter>
      </AppProviders>,
    );
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();

    // Fill the demo credentials seeded by the mock auth service and sign in.
    await user.type(screen.getByLabelText('Correo electrónico'), 'demo@adoptafacil.org');
    await user.type(screen.getByLabelText('Contraseña'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    // Returned to the protected origin, now rendered inside the shell.
    expect(await screen.findByRole('heading', { name: 'Adopciones' })).toBeInTheDocument();
  });
});
