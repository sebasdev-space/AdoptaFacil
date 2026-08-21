import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ProductCategory, type ProductPublic } from '@adoptafacil/contracts';
import { PublicMarketplacePage } from './public-marketplace-page';

/**
 * M10 (F-7) — public marketplace catalog. The endpoint returns a WRAPPED
 * page ({ items, total, limit, offset }); the page reads `.items`,
 * normalizes a non-array to [] and shows an explicit empty state — never
 * `.map` over a non-array (same anti-regression pattern as
 * `PublicCampaignsPage`/`PublicResourcesPage`).
 */
function product(id: string, name: string, over: Partial<ProductPublic> = {}): ProductPublic {
  return {
    id,
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    name,
    category: ProductCategory.Food,
    price: 85000,
    stock: 10,
    images: [],
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
      <PublicMarketplacePage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicMarketplacePage', () => {
  it('renders a card per active product, read from the wrapped `.items`', async () => {
    stub({
      items: [
        product('p1', 'Concentrado Premium', { category: ProductCategory.Food }),
        product('p2', 'Correa reforzada', { category: ProductCategory.Accessories }),
      ],
      total: 2,
      limit: 24,
      offset: 0,
    });
    renderList();

    const cards = await screen.findAllByTestId('product-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Concentrado Premium')).toBeInTheDocument();
    expect(screen.getByText('Correa reforzada')).toBeInTheDocument();
  });

  it('shows an explicit empty state for a wrapped-empty response', async () => {
    stub({ items: [], total: 0, limit: 24, offset: 0 });
    renderList();
    expect(
      await screen.findByText('No hay productos publicados ahora. Vuelve pronto.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('product-card')).not.toBeInTheDocument();
  });

  it('a NON-array body normalizes to [] → empty state, never throws', async () => {
    stub({ items: null, total: 0 });
    renderList();
    expect(
      await screen.findByText('No hay productos publicados ahora. Vuelve pronto.'),
    ).toBeInTheDocument();
  });

  it('shows the delivery/quality non-guarantee notice on every product card', async () => {
    stub({ items: [product('p1', 'Concentrado Premium')], total: 1, limit: 24, offset: 0 });
    renderList();
    await screen.findByTestId('product-card');
    expect(
      screen.getByText('AdoptaFácil no garantiza la entrega ni la calidad de este producto.'),
    ).toBeInTheDocument();
  });
});
