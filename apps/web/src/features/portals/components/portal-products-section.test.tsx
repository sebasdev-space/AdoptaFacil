import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ProductCategory, type ProductPublic } from '@adoptafacil/contracts';
import { PortalProductsSection } from './portal-products-section';

/**
 * §M14/M10 (F-MKT-PORTAL-1) — the public "Productos" section of an org's
 * portal. Closes the QA finding: the org's own marketplace catalog was only
 * reachable from the general `/marketplace` page, never from its own public
 * portal. Same anti-regression shape as `PortalCampaignsSection`: the
 * endpoint returns a WRAPPED page (`{ items, total, limit, offset }`); the
 * section reads `.items` via `listPublicProducts` (already normalized to
 * `[]`), and never `.map` over a non-array. Rendered under a router because
 * `ProductCard` links to the public product detail.
 */
function product(id: string, name: string, over: Partial<ProductPublic> = {}): ProductPublic {
  return {
    id,
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    name,
    category: ProductCategory.Accessories,
    price: 25_000,
    stock: 5,
    images: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

function stubProducts(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
}

function renderSection() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PortalProductsSection organizationId="org-1" />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalProductsSection', () => {
  it('requests the catalog scoped to the organization and renders a card per active product', async () => {
    stubProducts({
      items: [product('p1', 'Correa reflectiva'), product('p2', 'Comedero doble')],
      total: 2,
      limit: 12,
      offset: 0,
    });
    renderSection();

    const cards = await screen.findAllByTestId('product-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Correa reflectiva')).toBeInTheDocument();
    expect(screen.getByText('Comedero doble')).toBeInTheDocument();

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain('organizationId=org-1');
  });

  it('shows an explicit empty state for a wrapped-empty response (no throw)', async () => {
    stubProducts({ items: [], total: 0, limit: 12, offset: 0 });
    renderSection();

    expect(
      await screen.findByText(
        'Esta organización no tiene productos activos en el marketplace por ahora.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('product-card')).not.toBeInTheDocument();
  });

  it('T-028c regression: a NON-array body normalizes to [] → empty state, never .map throws', async () => {
    stubProducts({ id: 'org-1', name: 'Refugio Patitas' });
    renderSection();

    expect(
      await screen.findByText(
        'Esta organización no tiene productos activos en el marketplace por ahora.',
      ),
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
