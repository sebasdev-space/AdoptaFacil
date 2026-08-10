import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComingSoon } from './coming-soon';

describe('ComingSoon', () => {
  it('renders the title, description and a "Pronto" badge by default', () => {
    render(
      <ComingSoon title="Voluntariado" description="Muy pronto podrás gestionar voluntarios." />,
    );
    expect(screen.getByText('Voluntariado')).toBeInTheDocument();
    expect(screen.getByText('Muy pronto podrás gestionar voluntarios.')).toBeInTheDocument();
    expect(screen.getByText('Pronto')).toBeInTheDocument();
  });

  it('accepts a custom badge label', () => {
    render(<ComingSoon title="Reporte exógeno 2575" badgeLabel="Ola 3" />);
    expect(screen.getByText('Ola 3')).toBeInTheDocument();
  });
});
