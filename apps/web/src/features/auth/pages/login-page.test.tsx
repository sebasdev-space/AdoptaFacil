import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderShell } from '../../../test-utils';

describe('LoginPage', () => {
  it('validates required fields before submitting', async () => {
    const user = userEvent.setup();
    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated' } });

    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('El correo es obligatorio.')).toBeInTheDocument();
    expect(screen.getByText('La contraseña es obligatoria.')).toBeInTheDocument();
  });

  it('shows a generic error on invalid credentials without leaking details', async () => {
    const user = userEvent.setup();
    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated' } });

    await user.type(screen.getByLabelText('Correo electrónico'), 'nobody@nowhere.com');
    await user.type(screen.getByLabelText('Contraseña'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos iniciar sesión. Revisa tu correo y contraseña.');
    // Must not reveal which field failed or whether the account exists.
    expect(alert.textContent).not.toMatch(/existe|invalid_credentials|correo no|usuario/i);
    // Still on the login screen.
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('F-LANDING-02: shows a "Volver al inicio" link to the public general portal', () => {
    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated' } });
    expect(screen.getByRole('link', { name: '← Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('F1-03+: "Volver al inicio" is a SECONDARY (outline) button, not the primary CTA style', () => {
    renderShell({ route: '/login', session: { initialStatus: 'unauthenticated' } });
    const backLink = screen.getByRole('link', { name: '← Volver al inicio' });
    expect(backLink.className).toContain('button--outline');
    expect(backLink.className).not.toContain('button--primary');
    // "Iniciar sesión" (the submit button) stays the SOLID protagonist.
    expect(screen.getByRole('button', { name: 'Iniciar sesión' }).className).toContain(
      'button--primary',
    );
  });
});
