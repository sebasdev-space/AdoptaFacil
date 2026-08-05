import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { PublicAnimalSummary } from '@adoptafacil/contracts';
import { GeneralCatalogSection } from './general-catalog-section';

/**
 * F-LANDING-01 — the general portal's consolidated catalog, `GET /public/animals`
 * (S1-07). The endpoint returns a page-based, wrapped body ({ data, total, page,
 * limit }) — never `{ items }` (that's the per-org shape). Must read `.data`,
 * normalize a non-array to [], and never `.map` over a non-array (same
 * anti-regression discipline as T-028c's portal catalog).
 */
function animal(
  id: string,
  name: string,
  orgSlug: string,
  orgName: string,
  over: Partial<PublicAnimalSummary> = {},
): PublicAnimalSummary {
  return {
    id,
    organizationId: `org-${orgSlug}`,
    name,
    species: 'dog',
    sex: 'male',
    size: 'medium',
    status: 'available',
    organization: { id: `org-${orgSlug}`, name: orgName, slug: orgSlug },
    ...over,
  };
}

function stubCatalog(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
}

function renderSection() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GeneralCatalogSection />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeneralCatalogSection', () => {
  it('renders a card per animal, across different organizations, from `.data`', async () => {
    stubCatalog({
      data: [
        animal('a1', 'Firulais', 'patitas', 'Fundación Patitas'),
        animal('a2', 'Michi', 'huellas', 'Huellas de Esperanza', { species: 'cat' }),
      ],
      total: 2,
      page: 1,
      limit: 12,
    });
    renderSection();

    const cards = await screen.findAllByTestId('animal-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText('Michi')).toBeInTheDocument();
    // Each animal links to its PUBLIC detail (AnimalCard's own link, reused
    // unchanged — the org slug comes from `animal.organization.slug`).
    expect(cards[0]).toHaveAttribute('href', '/o/patitas/animales/a1');
    expect(cards[1]).toHaveAttribute('href', '/o/huellas/animales/a2');
    // Organization attribution + link to its public portal (not the per-animal
    // detail — that link is AnimalCard's own, unchanged).
    expect(screen.getByRole('link', { name: 'Fundación Patitas' })).toHaveAttribute(
      'href',
      '/o/patitas',
    );
    expect(screen.getByRole('link', { name: 'Huellas de Esperanza' })).toHaveAttribute(
      'href',
      '/o/huellas',
    );
  });

  it('shows an explicit empty state for a wrapped-empty response (no throw)', async () => {
    stubCatalog({ data: [], total: 0, page: 1, limit: 12 });
    renderSection();
    expect(await screen.findByText('No hay animales en adopción ahora')).toBeInTheDocument();
    expect(screen.queryByTestId('animal-card')).not.toBeInTheDocument();
  });

  it('regression: a NON-array `.data` normalizes to [] → empty state, never .map throws', async () => {
    stubCatalog({ data: null, total: 0 });
    renderSection();
    expect(await screen.findByText('No hay animales en adopción ahora')).toBeInTheDocument();
  });

  it('shows an error state when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 })),
    );
    renderSection();
    expect(await screen.findByText('No se pudo cargar')).toBeInTheDocument();
  });

  it('filters by species using the REAL endpoint param (species=cat), resetting to page 1', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL) =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [], total: 0 }) }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await screen.findByText('No hay animales en adopción ahora');
    fireEvent.click(screen.getByRole('button', { name: 'Gato' }));

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('species=cat'))).toBe(true);
    });
  });

  it('filters by city on submit (Buscar), using the REAL endpoint param (city=)', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL) =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [], total: 0 }) }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await screen.findByText('No hay animales en adopción ahora');
    fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: 'Medellín' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes(`city=${encodeURIComponent('Medellín')}`))).toBe(true);
    });
  });

  it('paginates using the real page param, disabling "Anterior" on the first page', async () => {
    const page1 = Array.from({ length: 12 }, (_, i) =>
      animal(`a${i}`, `Animal ${i}`, 'patitas', 'Fundación Patitas'),
    );
    const fetchMock = vi.fn((_url: RequestInfo | URL) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: page1, total: 20, page: 1, limit: 12 }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await screen.findByText('Página 1 de 2');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('page=2'))).toBe(true);
    });
  });
});
