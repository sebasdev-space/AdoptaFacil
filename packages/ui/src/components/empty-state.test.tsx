import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders as a status region with title, description and action', () => {
    render(
      <EmptyState
        title="Sin mascotas"
        description="Aún no hay adopciones registradas."
        action={<Button>Agregar</Button>}
      />,
    );

    const region = screen.getByRole('status');
    expect(region).toBeInTheDocument();
    expect(screen.getByText('Sin mascotas')).toBeInTheDocument();
    expect(screen.getByText('Aún no hay adopciones registradas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeInTheDocument();
  });

  it('renders without optional description or action', () => {
    render(<EmptyState title="Vacío" />);
    expect(screen.getByText('Vacío')).toBeInTheDocument();
  });
});
