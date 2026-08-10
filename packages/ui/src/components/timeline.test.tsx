import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Timeline } from './timeline';

describe('Timeline', () => {
  it('renders each event with its label and meta', () => {
    render(
      <Timeline
        events={[
          {
            key: '1',
            label: 'Esterilización realizada',
            meta: '28 jun 2026 · Dra. Salas',
            active: true,
          },
          { key: '2', label: 'Rescate e ingreso', meta: '30 may 2026' },
        ]}
      />,
    );

    expect(screen.getByText('Esterilización realizada')).toBeInTheDocument();
    expect(screen.getByText('28 jun 2026 · Dra. Salas')).toBeInTheDocument();
    expect(screen.getByText('Rescate e ingreso')).toBeInTheDocument();
  });
});
