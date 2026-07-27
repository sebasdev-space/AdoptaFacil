import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderShell } from '../../../test-utils';

describe('ResetPasswordPage', () => {
  it('shows an invalid-link state when the token is missing from the URL', () => {
    renderShell({ route: '/reset-password', session: { initialStatus: 'unauthenticated' } });
    expect(screen.getByText(/enlace no válido/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /solicitar un nuevo enlace/i })).toBeInTheDocument();
  });

  it('requires the two passwords to match before submitting', async () => {
    const user = userEvent.setup();
    renderShell({
      route: '/reset-password?token=good-token',
      session: { initialStatus: 'unauthenticated' },
    });

    await user.type(screen.getByLabelText('Nueva contraseña'), 'newpassword123');
    await user.type(screen.getByLabelText('Confirma la contraseña'), 'different456');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
  });

  it('confirms the reset with a valid token and shows a success message', async () => {
    const user = userEvent.setup();
    renderShell({
      route: '/reset-password?token=good-token',
      session: { initialStatus: 'unauthenticated' },
    });

    await user.type(screen.getByLabelText('Nueva contraseña'), 'newpassword123');
    await user.type(screen.getByLabelText('Confirma la contraseña'), 'newpassword123');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/tu contraseña se cambió/i);
    // The form is replaced by the confirmation.
    expect(screen.queryByRole('button', { name: 'Cambiar contraseña' })).not.toBeInTheDocument();
  });

  it('shows a generic error when the token is invalid/expired', async () => {
    const user = userEvent.setup();
    renderShell({
      route: '/reset-password?token=expired-token',
      session: { initialStatus: 'unauthenticated' },
    });

    await user.type(screen.getByLabelText('Nueva contraseña'), 'newpassword123');
    await user.type(screen.getByLabelText('Confirma la contraseña'), 'newpassword123');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText(/el enlace no es válido o expiró/i)).toBeInTheDocument();
  });
});
