import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProductCategory, type ProductPublic } from '@adoptafacil/contracts';
import { PublicProductDetailPage } from './public-product-detail-page';

/**
 * M10 (F-7) — public product detail. Reached either via nav-state (from the
 * catalog card) or by deep-link (`GET /public/marketplace/products/:id`).
 * The "Contactar por WhatsApp" CTA builds a `wa.me` link from the org's
 * WhatsApp number; the delivery/quality non-guarantee notice is ALWAYS
 * visible (never conditional on WhatsApp being configured).
 */
function product(over: Partial<ProductPublic> = {}): ProductPublic {
  return {
    id: 'p1',
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    organizationWhatsapp: '+57 300 123 4567',
    name: 'Concentrado Premium',
    category: ProductCategory.Food,
    price: 85000,
    stock: 10,
    images: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function stub(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: status === 200, status, json: async () => body })),
  );
}

function renderDetail(path = '/marketplace/p1') {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/marketplace/:id" element={<PublicProductDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicProductDetailPage', () => {
  it('resolves the product by deep-link and shows a wa.me CTA with a preloaded message', async () => {
    stub(product());
    renderDetail();

    expect(await screen.findByText('Concentrado Premium')).toBeInTheDocument();
    const cta = screen.getByTestId('whatsapp-cta') as HTMLAnchorElement;
    expect(cta.href).toContain('https://wa.me/573001234567');
    expect(cta.href).toContain(encodeURIComponent('Concentrado Premium'));
  });

  it('always shows the delivery/quality non-guarantee notice', async () => {
    stub(product());
    renderDetail();
    await screen.findByTestId('public-product-detail');
    expect(
      screen.getByText(/AdoptaFácil no garantiza la entrega ni la calidad/),
    ).toBeInTheDocument();
  });

  it('shows a fallback message (no CTA) when the org has no WhatsApp configured', async () => {
    stub(product({ organizationWhatsapp: undefined }));
    renderDetail();
    await screen.findByTestId('public-product-detail');
    expect(screen.queryByTestId('whatsapp-cta')).not.toBeInTheDocument();
    expect(
      screen.getByText('Esta organización no tiene un WhatsApp de contacto configurado.'),
    ).toBeInTheDocument();
  });

  it('a 404 deep-link shows the not-found empty state', async () => {
    stub(null, 404);
    renderDetail();
    expect(await screen.findByText('Producto no encontrado')).toBeInTheDocument();
  });
});
