import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';

describe('Input', () => {
  it('renders an accessible textbox with a placeholder', () => {
    render(<Input placeholder="Nombre" aria-label="Nombre" />);
    const input = screen.getByRole('textbox', { name: 'Nombre' });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Nombre');
  });

  it('reflects the disabled state', () => {
    render(<Input aria-label="Correo" disabled />);
    expect(screen.getByRole('textbox', { name: 'Correo' })).toBeDisabled();
  });

  it('marks invalid inputs for assistive tech', () => {
    render(<Input aria-label="Edad" aria-invalid />);
    expect(screen.getByRole('textbox', { name: 'Edad' })).toHaveAttribute('aria-invalid', 'true');
  });
});
