import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import {
  ResourceCategory,
  ResourceNeedStatus,
  type ResourceNeedPublic,
} from '@adoptafacil/contracts';
import { PortalNeedsSection } from './portal-needs-section';

/**
 * §M14/M09 (F-NEEDS-PORTAL-1) — the public "Necesita hoy" section of an org's
 * portal. Closes the QA finding: the org's own resource bank (M09) stayed in
 * `status: 'placeholder'` forever because the public needs catalog accepted
 * no organization filter. Same anti-regression shape as
 * `PortalProductsSection`: the endpoint returns a WRAPPED page (`{ items,
 * total, limit, offset }`); the section reads `.items` via `listPublicNeeds`
 * (already normalized to `[]`), and never `.map` over a non-array. Rendered
 * under a router because `NeedCard` links to the public need detail.
 */
function need(
  id: string,
  title: string,
  over: Partial<ResourceNeedPublic> = {},
): ResourceNeedPublic {
  return {
    id,
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    title,
    category: ResourceCategory.Food,
    quantityNeeded: 20,
    unit: 'kg',
    quantityFulfilled: 5,
    progress: 0.25,
    status: ResourceNeedStatus.PartiallyFulfilled,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

function stubNeeds(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
}

function renderSection() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PortalNeedsSection organizationId="org-1" />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalNeedsSection', () => {
  it('requests the needs catalog scoped to the organization and renders a card per active need', async () => {
    stubNeeds({
      items: [need('n1', 'Alimento para gatos'), need('n2', 'Medicinas')],
      total: 2,
      limit: 12,
      offset: 0,
    });
    renderSection();

    const cards = await screen.findAllByTestId('need-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Alimento para gatos')).toBeInTheDocument();
    expect(screen.getByText('Medicinas')).toBeInTheDocument();

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('organizationId=org-1');
  });

  it('shows an explicit empty state for a wrapped-empty response (no throw)', async () => {
    stubNeeds({ items: [], total: 0, limit: 12, offset: 0 });
    renderSection();

    expect(
      await screen.findByText('Esta organización no tiene necesidades publicadas por ahora.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('need-card')).not.toBeInTheDocument();
  });

  it('a NON-array body normalizes to [] → empty state, never .map throws', async () => {
    stubNeeds({ id: 'org-1', name: 'Refugio Patitas' });
    renderSection();

    expect(
      await screen.findByText('Esta organización no tiene necesidades publicadas por ahora.'),
    ).toBeInTheDocument();
  });

  it('shows a clear error state (not a crash) when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
    );
    renderSection();

    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument();
  });
});
