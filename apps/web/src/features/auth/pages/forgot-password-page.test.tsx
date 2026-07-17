import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';

describe('ForgotPasswordPage', () => {
  it('validates the email before submitting', async () => {
    const user = userEvent.setup();
    renderShell({ route: '/forgot', session: { initialStatus: 'unauthenticated' } });

    await user.type(screen.getByLabelText('Correo electrónico'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Enviar instrucciones' }));

    expect(await screen.findByText('Ingresa un correo válido.')).toBeInTheDocument();
  });

  it('shows a generic confirmation after a valid request (email is a stub)', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const user = userEvent.setup();
    renderShell({ route: '/forgot', session: { initialStatus: 'unauthenticated' } });

    await user.type(screen.getByLabelText('Correo electrónico'), 'someone@correo.com');
    await user.click(screen.getByRole('button', { name: 'Enviar instrucciones' }));

    // The generic confirmation is shown as an alert (unique phrasing).
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/restablecer la contraseña/i);
    // The form is replaced by the confirmation.
    expect(screen.queryByRole('button', { name: 'Enviar instrucciones' })).not.toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
