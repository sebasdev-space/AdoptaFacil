import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  it('renders the label and value', () => {
    render(<StatCard label="Animales activos" value={45} />);
    expect(screen.getByText('Animales activos')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
  });

  it('renders an optional delta with the up/down tint class', () => {
    render(
      <StatCard
        label="Recaudo neto"
        value="$2.314.100"
        delta={{ label: '▲18%', direction: 'up' }}
      />,
    );
    expect(screen.getByText('▲18%').className).toMatch(/stat-card__delta--up/);
  });

  it('renders an accessory next to the value', () => {
    render(<StatCard label="Documentos" value={2} accessory={<span>Revisar</span>} />);
    expect(screen.getByText('Revisar')).toBeInTheDocument();
  });
});
