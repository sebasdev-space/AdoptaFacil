import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransparencyProvider, type TransparencyStatus } from './transparency-context';
import { TransparencyIndicator } from './transparency-indicator';

function renderIndicator(value?: TransparencyStatus) {
  return render(
    <TransparencyProvider value={value}>
      <TransparencyIndicator />
    </TransparencyProvider>,
  );
}

describe('TransparencyIndicator', () => {
  it('renders the placeholder Nivel · % formalización · rendición by default', () => {
    renderIndicator();
    const indicator = screen.getByTestId('transparency-indicator');
    expect(indicator).toHaveTextContent('Nivel');
    expect(indicator).toHaveTextContent('3');
    expect(indicator).toHaveTextContent('82%');
    expect(indicator).toHaveTextContent('Al día');
  });

  it('renders provided ready data', () => {
    renderIndicator({
      status: 'ready',
      data: { level: 5, formalizationPct: 100, accountability: 'atrasada' },
    });
    const indicator = screen.getByTestId('transparency-indicator');
    expect(indicator).toHaveTextContent('5');
    expect(indicator).toHaveTextContent('100%');
    expect(indicator).toHaveTextContent('Atrasada');
  });

  it('renders a busy skeleton while loading', () => {
    renderIndicator({ status: 'loading' });
    const indicator = screen.getByTestId('transparency-indicator');
    expect(indicator).toHaveAttribute('aria-busy', 'true');
  });

  it('renders a graceful message on error', () => {
    renderIndicator({ status: 'error', message: 'boom' });
    expect(screen.getByTestId('transparency-indicator')).toHaveTextContent(
      'Indicador de transparencia no disponible',
    );
  });

  it('throws a helpful error when used outside its provider', () => {
    // Suppress React's error logging for the expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TransparencyIndicator />)).toThrow(/TransparencyProvider/);
    spy.mockRestore();
  });
});
