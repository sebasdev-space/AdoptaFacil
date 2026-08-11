import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
 *
 * Pulido visual (2da ronda): the catalog is fetched ONCE (server cap: 50) and
 * species/city/free-text are filtered CLIENT-SIDE in real time — no refetch
 * per filter change, no debounce needed (no network call in the loop).
 */
function animal(
  id: string,
  name: string,
  orgSlug: string,
  orgName: string,
  city: string,
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
    organization: { id: `org-${orgSlug}`, name: orgName, slug: orgSlug, city },
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

const FIRULAIS = animal('a1', 'Firulais', 'patitas', 'Fundación Patitas', 'Bogotá');
const MICHI = animal('a2', 'Michi', 'huellas', 'Huellas de Esperanza', 'Medellín', {
  species: 'cat',
});
const ROCKY = animal('a3', 'Rocky', 'patitas', 'Fundación Patitas', 'Bogotá', {
  breed: 'Labrador',
});

describe('GeneralCatalogSection', () => {
  it('renders a card per animal, across different organizations, from `.data`', async () => {
    stubCatalog({ data: [FIRULAIS, MICHI], total: 2, page: 1, limit: 50 });
    renderSection();

    const cards = await screen.findAllByTestId('animal-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText('Michi')).toBeInTheDocument();
    expect(cards[0]).toHaveAttribute('href', '/o/patitas/animales/a1');
    // Organization attribution + link to its public portal.
    expect(screen.getByRole('link', { name: /Fundación Patitas/ })).toHaveAttribute(
      'href',
      '/o/patitas',
    );
  });

  it('shows an explicit empty state for a wrapped-empty response (no throw)', async () => {
    stubCatalog({ data: [], total: 0, page: 1, limit: 50 });
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

  it('loads the catalog only ONCE and filters species live, client-side (no refetch per click)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: [FIRULAIS, MICHI], total: 2, page: 1, limit: 50 }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    await screen.findAllByTestId('animal-card');
    await userEvent.click(screen.getByRole('button', { name: 'Gato' }));

    expect(screen.queryByText('Firulais')).not.toBeInTheDocument();
    expect(screen.getByText('Michi')).toBeInTheDocument();
    // A single load — species filtering never re-hits the network.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('groups the city filter with REAL counts computed from the loaded catalog, and filters live on check', async () => {
    stubCatalog({ data: [FIRULAIS, MICHI, ROCKY], total: 3, page: 1, limit: 50 });
    renderSection();
    await screen.findAllByTestId('animal-card');

    // Bogotá has 2 (Firulais + Rocky), Medellín has 1 (Michi) — real counts.
    const bogotaLabel = screen.getByText('Bogotá').closest('label') as HTMLElement;
    expect(within(bogotaLabel).getByText('2')).toBeInTheDocument();
    const medellinLabel = screen.getByText('Medellín').closest('label') as HTMLElement;
    expect(within(medellinLabel).getByText('1')).toBeInTheDocument();

    await userEvent.click(within(bogotaLabel).getByRole('checkbox'));
    expect(screen.getByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText('Rocky')).toBeInTheDocument();
    expect(screen.queryByText('Michi')).not.toBeInTheDocument();
  });

  it('filters instantly by free text across name/breed/city/organization — no button, no debounce', async () => {
    stubCatalog({ data: [FIRULAIS, MICHI, ROCKY], total: 3, page: 1, limit: 50 });
    renderSection();
    await screen.findAllByTestId('animal-card');

    const search = screen.getByLabelText(/Buscar por nombre, raza, ciudad/i);
    await userEvent.type(search, 'Labrador');

    expect(screen.getByText('Rocky')).toBeInTheDocument();
    expect(screen.queryByText('Firulais')).not.toBeInTheDocument();
    expect(screen.queryByText('Michi')).not.toBeInTheDocument();
  });

  it('shows active-filter chips that can be removed individually or all at once', async () => {
    stubCatalog({ data: [FIRULAIS, MICHI], total: 2, page: 1, limit: 50 });
    renderSection();
    await screen.findAllByTestId('animal-card');

    await userEvent.click(screen.getByRole('button', { name: 'Gato' }));
    expect(screen.getByTestId('active-filter-chip-species')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(screen.queryByTestId('active-filter-chip-species')).not.toBeInTheDocument();
    expect(screen.getByText('Firulais')).toBeInTheDocument();
  });

  it('discloses when the true total exceeds the server cap (never claims to show everything)', async () => {
    stubCatalog({ data: [FIRULAIS], total: 73, page: 1, limit: 50 });
    renderSection();
    expect(await screen.findByText(/mostrando los primeros 50/)).toBeInTheDocument();
  });

  it('clicking an animal card opens a DETAIL MODAL instead of navigating away', async () => {
    stubCatalog({ data: [FIRULAIS], total: 1, page: 1, limit: 50 });
    renderSection();
    await userEvent.click(await screen.findByTestId('animal-card'));

    // Still on the catalog (never navigated) — the modal shows the same real data.
    expect(screen.getByTestId('general-catalog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('Firulais')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByTestId('request-adoption-cta')).toHaveAttribute(
      'href',
      expect.stringContaining('organizationId=org-patitas'),
    );
  });

  it('shows "¿No encuentras tu nuevo amigo?" and opens the existing "Disponible próximamente" modal on click', async () => {
    stubCatalog({ data: [FIRULAIS], total: 1, page: 1, limit: 50 });
    renderSection();
    await screen.findAllByTestId('animal-card');

    expect(screen.getByText('¿No encuentras tu nuevo amigo?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crear alerta' }));

    expect(await screen.findByText('Disponible próximamente')).toBeInTheDocument();
    // No real alert is created — this is the shared placeholder, not new logic.
    expect(screen.getByText('Pronto')).toBeInTheDocument();
  });

  it('QA visual: caps the initial render at 12 cards with "Ver más" — loading/filtering all 50 live does not mean rendering all 50 at once', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      animal(`a${i}`, `Animal ${i}`, 'patitas', 'Fundación Patitas', 'Bogotá'),
    );
    stubCatalog({ data: many, total: 20, page: 1, limit: 50 });
    renderSection();

    const cards = await screen.findAllByTestId('animal-card');
    expect(cards).toHaveLength(12);
    // The "no encuentras a tu amigo" tile only shows once everything is visible.
    expect(screen.queryByText('¿No encuentras tu nuevo amigo?')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }));
    expect(await screen.findAllByTestId('animal-card')).toHaveLength(20);
    expect(screen.getByText('¿No encuentras tu nuevo amigo?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
  });

  it('resets "Ver más" back to 12 when a filter changes (never leaves a stale, confusing count)', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      animal(`a${i}`, `Animal ${i}`, 'patitas', 'Fundación Patitas', 'Bogotá', {
        species: i === 0 ? 'cat' : 'dog',
      }),
    );
    stubCatalog({ data: many, total: 20, page: 1, limit: 50 });
    renderSection();

    await screen.findAllByTestId('animal-card');
    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }));
    expect(await screen.findAllByTestId('animal-card')).toHaveLength(20);

    await userEvent.click(screen.getByRole('button', { name: 'Perro' }));
    // 19 dogs match, but the view resets to showing only the first 12.
    expect(await screen.findAllByTestId('animal-card')).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Ver más' })).toBeInTheDocument();
  });
});
