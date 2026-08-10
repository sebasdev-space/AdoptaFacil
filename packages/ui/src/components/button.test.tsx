import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, buttonVariants } from './button';

describe('Button', () => {
  it('renders its children as an accessible button', () => {
    render(<Button>Adoptar</Button>);
    expect(screen.getByRole('button', { name: 'Adoptar' })).toBeInTheDocument();
  });

  it('applies the outline variant class', () => {
    render(<Button variant="outline">Cancelar</Button>);
    expect(screen.getByRole('button', { name: 'Cancelar' }).className).toMatch(/button--outline/);
  });

  it('REFACTOR-VISUAL: defaults to the primary (pill) variant', () => {
    render(<Button>Adoptar</Button>);
    expect(screen.getByRole('button', { name: 'Adoptar' }).className).toMatch(/button--primary/);
  });

  it('REFACTOR-VISUAL: "dark" variant renders the solid navy surface', () => {
    render(<Button variant="dark">Soy una organización</Button>);
    expect(screen.getByRole('button', { name: 'Soy una organización' }).className).toMatch(
      /button--dark/,
    );
  });

  it('buttonVariants() produces the same classes for non-<button> elements (e.g. Link)', () => {
    expect(buttonVariants({ variant: 'outline', size: 'sm' })).toMatch(/button--outline/);
    expect(buttonVariants({ variant: 'outline', size: 'sm' })).toMatch(/button--sm/);
  });
});
