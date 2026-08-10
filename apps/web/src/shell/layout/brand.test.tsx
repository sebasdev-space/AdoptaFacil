import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Brand } from './brand';

describe('Brand', () => {
  it('renders the wordmark in the default (dark-text) colors', () => {
    render(<Brand />);
    expect(screen.getByText('Fácil')).toHaveClass('text-primary');
  });

  it('REFACTOR-VISUAL Fase B: "inverse" swaps to light-on-navy colors', () => {
    render(<Brand inverse />);
    const tealPart = screen.getByText('Fácil');
    // "Fácil" is the inner span; its parent carries the outer wordmark's color.
    expect(tealPart.parentElement).toHaveClass('text-white');
    expect(tealPart).toHaveClass('text-brand-teal');
  });
});
