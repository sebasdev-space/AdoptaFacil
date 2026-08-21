import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import {
  ResourceCategory,
  ResourceNeedStatus,
  type ResourceNeedPublic,
} from '@adoptafacil/contracts';
import { PublicResourcesPage } from './public-resources-page';

/**
 * M09 (F-6) — public resource-bank catalog. The endpoint returns a WRAPPED
 * page ({ items, total, limit, offset }); the page reads `.items`,
 * normalizes a non-array to [] and shows an explicit empty state — never
 * `.map` over a non-array (same anti-regression pattern as
 * `PublicCampaignsPage`).
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
    quantityFulfilled: 0,
    progress: 0,
    status: ResourceNeedStatus.Needed,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function stub(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
}

function renderList() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PublicResourcesPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicResourcesPage', () => {
  it('renders a card per need still accepting help, read from the wrapped `.items`', async () => {
    stub({
      items: [
        need('n1', 'Alimento para gatos', { category: ResourceCategory.Food }),
        need('n2', 'Medicinas para perros', { category: ResourceCategory.Medicine }),
      ],
      total: 2,
      limit: 24,
      offset: 0,
    });
    renderList();

    const cards = await screen.findAllByTestId('need-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Alimento para gatos')).toBeInTheDocument();
    expect(screen.getByText('Medicinas para perros')).toBeInTheDocument();
    expect(screen.getByText('Medicamentos')).toBeInTheDocument();
  });

  it('shows an explicit empty state for a wrapped-empty response', async () => {
    stub({ items: [], total: 0, limit: 24, offset: 0 });
    renderList();
    expect(
      await screen.findByText('No hay necesidades publicadas ahora. Vuelve pronto.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('need-card')).not.toBeInTheDocument();
  });

  it('a NON-array body normalizes to [] → empty state, never throws', async () => {
    stub({ items: null, total: 0 });
    renderList();
    expect(
      await screen.findByText('No hay necesidades publicadas ahora. Vuelve pronto.'),
    ).toBeInTheDocument();
  });

  it('shows the progress read straight from the contract', async () => {
    stub({
      items: [
        need('n1', 'Alimento para gatos', {
          quantityFulfilled: 8,
          quantityNeeded: 20,
          progress: 0.4,
        }),
      ],
      total: 1,
      limit: 24,
      offset: 0,
    });
    renderList();
    await screen.findByTestId('need-card');
    expect(screen.getByTestId('need-progress')).toHaveTextContent('40%');
  });
});
