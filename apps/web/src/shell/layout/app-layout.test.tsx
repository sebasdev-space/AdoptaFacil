import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderShell } from '../../test-utils';

// These tests render module routes with no network side effects (the home route
// fetches /health and is covered in routing.test.tsx).

describe('AppLayout', () => {
  it('renders the shell chrome around the routed content', () => {
    renderShell({ route: '/adopciones', session: { initialStatus: 'authenticated' } });

    // Header, navigation and content region all present.
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir menú de navegación' })).toBeInTheDocument();
  });

  it('shows the persistent transparency indicator in the header (§M14)', () => {
    renderShell({ route: '/adopciones', session: { initialStatus: 'authenticated' } });

    const header = screen.getByRole('banner');
    const indicator = within(header).getByTestId('transparency-indicator');
    expect(indicator).toBeInTheDocument();
    // Nivel · % formalización · rendición.
    expect(indicator).toHaveTextContent('Nivel');
    expect(indicator).toHaveTextContent('3');
    expect(indicator).toHaveTextContent('82%');
    expect(indicator).toHaveTextContent('Al día');
  });

  it('keeps the transparency indicator present on every module', () => {
    renderShell({ route: '/transparencia', session: { initialStatus: 'authenticated' } });
    const header = screen.getByRole('banner');
    expect(within(header).getByTestId('transparency-indicator')).toBeInTheDocument();
  });
});
