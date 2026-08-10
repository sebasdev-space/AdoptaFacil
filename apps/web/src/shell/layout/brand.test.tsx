import { render, screen } from '@testing-library/react';
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
});
