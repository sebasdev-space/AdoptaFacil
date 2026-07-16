import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders its label', () => {
    render(<Badge>Disponible</Badge>);
    expect(screen.getByText('Disponible')).toBeInTheDocument();
  });

  it('applies semantic variant tokens', () => {
    render(<Badge variant="success">Adoptado</Badge>);
    expect(screen.getByText('Adoptado')).toHaveClass('bg-success');
  });

  it('defaults to the primary token', () => {
    render(<Badge>Nuevo</Badge>);
    expect(screen.getByText('Nuevo')).toHaveClass('bg-primary');
  });
});
