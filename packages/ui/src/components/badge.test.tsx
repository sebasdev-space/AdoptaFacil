import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders its label', () => {
    render(<Badge>Disponible</Badge>);
    expect(screen.getByText('Disponible')).toBeInTheDocument();
  });

  it('applies semantic variant classes', () => {
    render(<Badge variant="success">Adoptado</Badge>);
    expect(screen.getByText('Adoptado').className).toMatch(/status-pill--success/);
  });

  it('defaults to the default pill variant', () => {
    render(<Badge>Nuevo</Badge>);
    expect(screen.getByText('Nuevo').className).toMatch(/status-pill--default/);
  });
});
