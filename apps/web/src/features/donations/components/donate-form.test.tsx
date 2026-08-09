import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DonateForm } from './donate-form';

/**
 * §M05, P1 — the donate form shows the transparent breakdown BEFORE paying and the
 * "cubro la comisión" checkbox drives commissionPayer. Presentational only (no
 * api/session), so it renders standalone.
 */
const digits = (el: HTMLElement) => Number.parseInt(el.textContent!.replace(/[^\d]/g, ''), 10);

describe('DonateForm', () => {
  it('keeps the breakdown hidden and submit disabled until a valid amount is entered', () => {
    render(<DonateForm organizationName="Refugio Patitas" onDonate={vi.fn()} />);
    expect(screen.queryByTestId('donation-breakdown')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeDisabled();
  });

  it('shows the breakdown for a valid amount; org mode charges exactly the intended amount', () => {
    render(<DonateForm organizationName="Refugio Patitas" onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });

    expect(screen.getByTestId('donation-breakdown')).toBeInTheDocument();
    // Org mode: total charged = 50000; the net the org receives is strictly less.
    expect(digits(screen.getByTestId('breakdown-amountCharged'))).toBe(50000);
    expect(digits(screen.getByTestId('breakdown-net'))).toBeLessThan(50000);
    expect(screen.getByRole('button', { name: /Donar a Refugio Patitas/ })).toBeEnabled();
  });

  it('checking "cubro la comisión" raises the total charged and nets ≈ the intended amount', () => {
    render(<DonateForm organizationName="Refugio Patitas" onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });

    const chargedOrg = digits(screen.getByTestId('breakdown-amountCharged'));
    fireEvent.click(screen.getByTestId('cover-fee'));

    const chargedDonor = digits(screen.getByTestId('breakdown-amountCharged'));
    expect(chargedDonor).toBeGreaterThan(chargedOrg);
    // Now the org receives essentially the full intended amount.
    expect(Math.abs(digits(screen.getByTestId('breakdown-net')) - 50000)).toBeLessThanOrEqual(2);
  });

  it('F-NOMENCLATURA: shows "Apoyo de sostenimiento a AdoptaFácil", not "Comisión AdoptaFácil" (indicación fiscal)', () => {
    render(<DonateForm organizationName="Refugio Patitas" onDonate={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });

    expect(screen.getByText('Apoyo de sostenimiento a AdoptaFácil (4%)')).toBeInTheDocument();
    expect(screen.queryByText(/Comisión AdoptaFácil/i)).not.toBeInTheDocument();
  });

  it('F-NOMENCLATURA-CHECKBOX: the checkbox names both real components, never calling the platform cut a "comisión"', () => {
    render(<DonateForm organizationName="Refugio Patitas" onDonate={vi.fn()} />);

    expect(
      screen.getByText(
        'Cubro el apoyo de sostenimiento a AdoptaFácil y la comisión de la pasarela para que la organización reciba el monto completo.',
      ),
    ).toBeInTheDocument();
    // The gateway's (Wompi, third party) commission keeps its real name — only
    // AdoptaFácil's own retained percentage was relabeled (extends #100).
    expect(screen.queryByText(/^Cubro la comisión /)).not.toBeInTheDocument();
  });

  it('submits the intended amount and the chosen commission payer', () => {
    const onDonate = vi.fn();
    render(<DonateForm organizationName="Refugio Patitas" onDonate={onDonate} />);
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.click(screen.getByTestId('cover-fee'));
    fireEvent.click(screen.getByRole('button', { name: /Donar a Refugio Patitas/ }));

    expect(onDonate).toHaveBeenCalledTimes(1);
    expect(onDonate).toHaveBeenCalledWith({ intendedAmount: 50000, commissionPayer: 'donor' });
  });
});
