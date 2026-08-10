import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState } from './error-state';

describe('ErrorState', () => {
  it('renders as an alert region with a default title and retry button', () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('No se pudo cargar la información')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Reintentar' });
    retry.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders custom title/description and an omittable icon', () => {
    render(<ErrorState icon={null} title="Falló la carga" description="Revisa tu conexión." />);
    expect(screen.getByText('Falló la carga')).toBeInTheDocument();
    expect(screen.getByText('Revisa tu conexión.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
