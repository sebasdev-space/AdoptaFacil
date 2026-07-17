import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toaster } from './toaster';
import { toast } from './use-toast';

describe('Toast', () => {
  it('renders a queued toast with its title and description in a live region', async () => {
    render(<Toaster />);

    act(() => {
      toast({ title: 'Guardado', description: 'La mascota fue registrada.', variant: 'success' });
    });

    expect(await screen.findByText('Guardado')).toBeInTheDocument();
    expect(screen.getByText('La mascota fue registrada.')).toBeInTheDocument();
    // Radix renders toasts inside a status list with a close control.
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
  });
});
