import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Brand } from './brand';

describe('Brand', () => {
  it('renders the real logo mark plus the "AdoptaFácil" wordmark', () => {
    render(<Brand />);
    expect(screen.getByText('Adopta')).toBeInTheDocument();
    expect(screen.getByText('Fácil')).toBeInTheDocument();
  });

  it('REFACTOR-VISUAL v2: "inverse" still renders on a dark surface without duplicating the accessible name', () => {
    render(<Brand inverse />);
    expect(screen.getByText('Adopta')).toBeInTheDocument();
    expect(screen.getByText('Fácil')).toBeInTheDocument();
    // The wordmark text is the accessible name; the icon next to it must not
    // announce "AdoptaFácil" a second time via its own aria-label.
    expect(screen.queryByRole('img', { name: 'AdoptaFácil' })).not.toBeInTheDocument();
  });

  it('con "to" es un enlace al inicio del lugar donde vive (/inicio en el sistema, / en lo público)', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Brand to="/inicio" />
        <Brand to="/" />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link', { name: 'Ir al inicio' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/inicio', '/']);
  });

  it('sin "to" no es un enlace (compatibilidad)', () => {
    render(<Brand />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
