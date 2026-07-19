import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';

// Registration succeeds → navigates to the home route, which fetches /health.
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
  vi.restoreAllMocks();
});

describe('RegisterPage — Organization vs Person', () => {
  it('shows the organization fields by default and person fields after switching', async () => {
    const user = userEvent.setup();
    renderShell({ route: '/register', session: { initialStatus: 'unauthenticated' } });

    // Organization tab: org-specific fields present, person-specific absent.
    expect(screen.getByLabelText('Nombre de la organización')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de contacto')).toBeInTheDocument();
    expect(screen.queryByLabelText('Apellido')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Persona' }));

    // Person tab: person fields present, org-specific fields gone (no mixing).
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.getByLabelText('Apellido')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre de contacto')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre de la organización')).not.toBeInTheDocument();
  });

  it('shows validation errors when the organization form is empty', async () => {
    const user = userEvent.setup();
    renderShell({ route: '/register', session: { initialStatus: 'unauthenticated' } });

    await user.click(screen.getByRole('button', { name: 'Crear cuenta de organización' }));

    expect(await screen.findByText('El nombre de la organización es obligatorio.')).toBeVisible();
    expect(screen.getByText('El nombre de contacto es obligatorio.')).toBeInTheDocument();
    // Still on the registration screen (no navigation on invalid input).
    expect(screen.getByRole('heading', { name: 'Crear cuenta' })).toBeInTheDocument();
  });

  it('registers a valid organization, stores the session and enters the shell', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    renderShell({ route: '/register', session: { initialStatus: 'unauthenticated' } });

    await user.type(screen.getByLabelText('Nombre de la organización'), 'Fundación Patitas');
    await user.type(screen.getByLabelText('Nombre de contacto'), 'Ana Ruiz');
    await user.type(screen.getByLabelText('Correo electrónico'), 'org@patitas.org');
    await user.type(screen.getByLabelText('Contraseña'), 'supersecret');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'supersecret');

    await user.click(screen.getByRole('button', { name: 'Crear cuenta de organización' }));

    // Landed inside the protected shell.
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    // Non-negotiable: no browser storage was touched.
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
  });

  it('registers a valid person and enters the shell', async () => {
    const user = userEvent.setup();
    renderShell({ route: '/register', session: { initialStatus: 'unauthenticated' } });

    await user.click(screen.getByRole('tab', { name: 'Persona' }));
    await user.type(screen.getByLabelText('Nombre'), 'Camila');
    await user.type(screen.getByLabelText('Apellido'), 'Gómez');
    await user.type(screen.getByLabelText('Correo electrónico'), 'camila@correo.com');
    await user.type(screen.getByLabelText('Contraseña'), 'supersecret');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'supersecret');

    await user.click(screen.getByRole('button', { name: 'Crear cuenta personal' }));

    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('rejects mismatched passwords', async () => {
    const user = userEvent.setup();
    renderShell({ route: '/register', session: { initialStatus: 'unauthenticated' } });

    await user.click(screen.getByRole('tab', { name: 'Persona' }));
    await user.type(screen.getByLabelText('Nombre'), 'Camila');
    await user.type(screen.getByLabelText('Apellido'), 'Gómez');
    await user.type(screen.getByLabelText('Correo electrónico'), 'camila@correo.com');
    await user.type(screen.getByLabelText('Contraseña'), 'supersecret');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'different1');

    await user.click(screen.getByRole('button', { name: 'Crear cuenta personal' }));

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Inicio' })).not.toBeInTheDocument();
  });
});
