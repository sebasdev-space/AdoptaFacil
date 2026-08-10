import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../../shell/auth';
import { GeneralPortalPage } from './general-portal-page';

/**
 * REFACTOR-VISUAL Fase C1 — the public landing's brand hero. Behavior (the
 * redirect-when-authenticated, the catalog itself) is already covered in
 * routing.test.tsx/general-catalog-section.test.tsx; this only locks in the
 * hero's real content and its anchor-scroll link to the catalog below it.
 */
function renderLanding() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [], total: 0 }) }),
    ),
  );
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SessionProvider initialStatus="unauthenticated">
        <GeneralPortalPage />
      </SessionProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeneralPortalPage hero', () => {
  it('renders the real heading/description (never fabricated stats)', async () => {
    renderLanding();
    expect(
      screen.getByRole('heading', { name: 'Encuentra a tu próxima mascota' }),
    ).toBeInTheDocument();
    // The mockup's hero shows illustrative counters ("3.482 adopciones…") that
    // don't back onto any real endpoint — must never appear here.
    expect(screen.queryByText(/adopciones formalizadas/)).not.toBeInTheDocument();
    // Let the catalog's own fetch settle inside this test's act() scope,
    // instead of leaking a state update past the test (FIX-FLAKY-2 pattern).
    await screen.findByText('No hay animales en adopción ahora');
  });

  it('the primary CTA anchors to the catalog section below, not a fabricated route', async () => {
    renderLanding();
    const cta = screen.getByRole('link', { name: 'Ver mascotas en adopción' });
    expect(cta).toHaveAttribute('href', '#general-catalog-heading');
    await screen.findByText('No hay animales en adopción ahora');
  });

  it('the secondary CTA links real orgs to registration', async () => {
    renderLanding();
    expect(screen.getByRole('link', { name: 'Soy una organización' })).toHaveAttribute(
      'href',
      '/register',
    );
    await screen.findByText('No hay animales en adopción ahora');
  });
});
