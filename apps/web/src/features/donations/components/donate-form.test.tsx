import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DonateForm } from './donate-form';

/**
 * §M05, P1 — the donate form shows the transparent breakdown BEFORE paying and the
 * "cubro la comisión" checkbox drives commissionPayer. Presentational only (no
 * api/session), so it renders standalone.
 */
const digits = (el: HTMLElement) => Number.parseInt(el.textContent!.replace(/[^\d]/g, ''), 10);

describe('DonateForm (with an active session — pre-existing behavior, non-regression)', () => {
  it('keeps the breakdown hidden and submit disabled until a valid amount is entered', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);
    expect(screen.queryByTestId('donation-breakdown')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeDisabled();
  });

  it('shows the breakdown for a valid amount; org mode charges exactly the intended amount', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });

    expect(screen.getByTestId('donation-breakdown')).toBeInTheDocument();
    // Org mode: total charged = 50000; the net the org receives is strictly less.
    expect(digits(screen.getByTestId('breakdown-amountCharged'))).toBe(50000);
    expect(digits(screen.getByTestId('breakdown-net'))).toBeLessThan(50000);
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeEnabled();
  });

  it('checking "cubro la comisión" raises the total charged and nets ≈ the intended amount', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });

    const chargedOrg = digits(screen.getByTestId('breakdown-amountCharged'));
    fireEvent.click(screen.getByTestId('cover-fee'));

    const chargedDonor = digits(screen.getByTestId('breakdown-amountCharged'));
    expect(chargedDonor).toBeGreaterThan(chargedOrg);
    // Now the org receives essentially the full intended amount.
    expect(Math.abs(digits(screen.getByTestId('breakdown-net')) - 50000)).toBeLessThanOrEqual(2);
  });

  it('F-NOMENCLATURA: shows "Apoyo de sostenimiento a AdoptaFácil", not "Comisión AdoptaFácil" (indicación fiscal)', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });

    expect(screen.getByText('Apoyo de sostenimiento a AdoptaFácil (4%)')).toBeInTheDocument();
    expect(screen.queryByText(/Comisión AdoptaFácil/i)).not.toBeInTheDocument();
  });

  it('F-NOMENCLATURA-CHECKBOX: the checkbox names both real components, never calling the platform cut a "comisión"', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);

    expect(
      screen.getByText(
        'Cubro el apoyo de sostenimiento a AdoptaFácil y la comisión de la pasarela para que la organización reciba el monto completo.',
      ),
    ).toBeInTheDocument();
    // The gateway's (MercadoPago, third party) commission keeps its real name — only
    // AdoptaFácil's own retained percentage was relabeled (extends #100).
    expect(screen.queryByText(/^Cubro la comisión /)).not.toBeInTheDocument();
  });

  it('does NOT show the guest name/email fields when there is a session', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={vi.fn()} />);
    expect(screen.queryByTestId('donation-guest-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('donation-guest-email')).not.toBeInTheDocument();
  });

  it('submits the intended amount, the chosen commission payer, and anonymous (default false)', () => {
    const onDonate = vi.fn();
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={onDonate} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.click(screen.getByTestId('cover-fee'));
    fireEvent.click(screen.getByRole('button', { name: /Donar a Refugio Patitas/ }));

    expect(onDonate).toHaveBeenCalledTimes(1);
    expect(onDonate).toHaveBeenCalledWith({
      intendedAmount: 50000,
      commissionPayer: 'donor',
      anonymous: false,
      guestPayer: undefined,
    });
  });

  it('submits anonymous: true when the "donar anónimamente" checkbox is checked', () => {
    const onDonate = vi.fn();
    render(<DonateForm organizationName="Refugio Patitas" hasSession onDonate={onDonate} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.click(screen.getByTestId('donate-anonymous'));
    fireEvent.click(screen.getByRole('button', { name: /Donar a Refugio Patitas/ }));

    expect(onDonate).toHaveBeenCalledWith(expect.objectContaining({ anonymous: true }));
  });
});

/**
 * Checkout de invitado (requisito FINAL del cliente): donar nunca exige cuenta
 * ni login. Sin sesión, el formulario pide nombre + correo y los exige antes
 * de habilitar "Donar".
 */
describe('DonateForm (guest checkout — no session)', () => {
  it('shows the guest name/email fields and keeps "Donar" disabled until both are filled', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession={false} onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });

    // A valid amount alone is not enough for a guest — identity is required too.
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeDisabled();

    fireEvent.change(screen.getByTestId('donation-guest-name'), {
      target: { value: 'Invitado Test' },
    });
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeDisabled();

    fireEvent.change(screen.getByTestId('donation-guest-email'), {
      target: { value: 'invitado@test.dev' },
    });
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeEnabled();
  });

  it('keeps "Donar" disabled with an obviously invalid email', () => {
    render(<DonateForm organizationName="Refugio Patitas" hasSession={false} onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.change(screen.getByTestId('donation-guest-name'), {
      target: { value: 'Invitado Test' },
    });
    fireEvent.change(screen.getByTestId('donation-guest-email'), {
      target: { value: 'no-es-un-correo' },
    });

    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeDisabled();
  });

  it('submits the guest name/email as guestPayer', () => {
    const onDonate = vi.fn();
    render(
      <DonateForm organizationName="Refugio Patitas" hasSession={false} onDonate={onDonate} />,
    );
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.change(screen.getByTestId('donation-guest-name'), {
      target: { value: 'Invitado Test' },
    });
    fireEvent.change(screen.getByTestId('donation-guest-email'), {
      target: { value: 'invitado@test.dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Donar a Refugio Patitas/ }));

    expect(onDonate).toHaveBeenCalledWith({
      intendedAmount: 50000,
      commissionPayer: 'organization',
      anonymous: false,
      guestPayer: { fullName: 'Invitado Test', email: 'invitado@test.dev' },
    });
  });
});
