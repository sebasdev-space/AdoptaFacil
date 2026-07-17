import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayoutErrorBoundary } from './error-boundary';

function Boom(): never {
  throw new Error('render failed');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LayoutErrorBoundary', () => {
  it('renders content when nothing throws', () => {
    render(
      <LayoutErrorBoundary>
        <p>contenido</p>
      </LayoutErrorBoundary>,
    );
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('renders the fallback error state when a child throws', () => {
    // Boundaries log the caught error; silence it for a clean test run.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <LayoutErrorBoundary>
        <Boom />
      </LayoutErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
