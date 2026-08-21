import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductCategory, Role, type Product } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * M10 (F-7) — `/organizacion/marketplace`, gestión interna de productos.
 * Publicar/editar: Owner/Administrator/Operator; ver: + ReadOnlyAuditor
 * (calcado del @Roles real de `MarketplaceProductsController`).
 */
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Dueña',
        email: 'duena@patitas.org',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

function product(id: string, name: string, over: Partial<Product> = {}): Product {
  return {
    id,
    organizationId: 'org-1',
    name,
    category: ProductCategory.Food,
    price: 85000,
    stock: 10,
    isActive: true,
    images: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const body = handler(String(input), init);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => body,
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MarketplacePage — gestión interna del catálogo (F-7)', () => {
  it('renders a management card per product read from the wrapped `.items`', async () => {
    stubFetch(() => ({
      items: [product('p1', 'Concentrado Premium'), product('p2', 'Correa reforzada')],
      total: 2,
      limit: 50,
      offset: 0,
    }));
    renderShell({ route: '/organizacion/marketplace', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Concentrado Premium')).toBeInTheDocument();
    expect(screen.getByText('Correa reforzada')).toBeInTheDocument();
    expect(screen.getAllByTestId('product-manage-card')).toHaveLength(2);
  });

  it('shows a friendly empty state with a "Publicar producto" CTA for a manager', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    renderShell({ route: '/organizacion/marketplace', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Aún no hay productos publicados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar tu primer producto' })).toBeInTheDocument();
  });

  it('hides "Publicar producto" from a ReadOnlyAuditor (view-only)', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    renderShell({ route: '/organizacion/marketplace', ...sessionWith([Role.ReadOnlyAuditor]) });

    await screen.findByRole('heading', { name: 'Marketplace' });
    expect(screen.queryByRole('button', { name: 'Publicar producto' })).not.toBeInTheDocument();
  });

  it('publishes a product with the REAL required fields and toasts success', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let created = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST' && url.includes('/marketplace/products')) {
        created = true;
        return product('p1', 'Concentrado Premium', { price: 85000, stock: 0 });
      }
      return {
        items: created ? [product('p1', 'Concentrado Premium')] : [],
        total: created ? 1 : 0,
        limit: 50,
        offset: 0,
      };
    });
    renderShell({ route: '/organizacion/marketplace', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Publicar producto' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Concentrado Premium' },
    });
    fireEvent.change(screen.getByLabelText('Precio (COP)'), { target: { value: '85000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publicar producto' }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(post).toBeDefined();
      const body = JSON.parse(String(post?.init?.body));
      expect(body).toMatchObject({
        name: 'Concentrado Premium',
        category: ProductCategory.Food,
        price: 85000,
      });
    });
    expect(await screen.findByText('Producto publicado')).toBeInTheDocument();
  });
});
