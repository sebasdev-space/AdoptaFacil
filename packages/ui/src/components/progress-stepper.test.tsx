import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressStepper } from './progress-stepper';

const STEPS = [
  { key: 'informal', label: 'Informal' },
  { key: 'proceso', label: 'En proceso' },
  { key: 'formalizada', label: 'Formalizada' },
  { key: 'esal', label: 'ESAL' },
  { key: 'rte', label: 'ESAL + RTE', sublabel: 'en curso · 80%' },
];

describe('ProgressStepper', () => {
  it('renders every step label', () => {
    render(<ProgressStepper steps={STEPS} currentIndex={4} />);
    for (const step of STEPS) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
    expect(screen.getByText('en curso · 80%')).toBeInTheDocument();
  });

  it('marks steps before currentIndex as done', () => {
    render(<ProgressStepper steps={STEPS} currentIndex={4} />);
    expect(screen.getByText('Informal').className).toMatch(/stepper__label--done/);
    expect(screen.getByText('ESAL + RTE').className).toMatch(/stepper__label--current/);
  });
});
