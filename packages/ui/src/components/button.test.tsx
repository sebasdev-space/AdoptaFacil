import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders its children as an accessible button', () => {
    render(<Button>Adoptar</Button>);
    expect(screen.getByRole('button', { name: 'Adoptar' })).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    render(<Button variant="outline">Cancelar</Button>);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('border');
  });

  it('REFACTOR-VISUAL: defaults to a pill shape (brand direction)', () => {
    render(<Button>Adoptar</Button>);
    expect(screen.getByRole('button', { name: 'Adoptar' })).toHaveClass('rounded-full');
  });

  it('REFACTOR-VISUAL: "dark" variant renders the solid navy surface', () => {
    render(<Button variant="dark">Soy una organización</Button>);
    expect(screen.getByRole('button', { name: 'Soy una organización' })).toHaveClass(
      'bg-navy',
      'text-white',
    );
  });
});
