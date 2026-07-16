import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders a decorative pulsing placeholder', () => {
    render(<Skeleton data-testid="sk" className="h-4 w-32" />);
    const el = screen.getByTestId('sk');
    expect(el).toHaveClass('animate-pulse-soft');
    expect(el).toHaveAttribute('aria-hidden');
  });
});
