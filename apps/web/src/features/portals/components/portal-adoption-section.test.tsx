import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { AnimalSummary } from '@adoptafacil/contracts';
import { PortalAdoptionSection } from './portal-adoption-section';

/**
 * §M14/M03 (T-052, rediseño T-D03) — the public "Mascotas en adopción"
 * section. The endpoint returns a WRAPPED page ({ items, total, limit,
 * offset }); the section must read `.items`, normalize a non-array to [],
 * and NEVER `.map` over a non-array (explicit regression of the T-028c
 * `.map` bug). Rendered under a router for the card links.
 *
 * Filters/orden (T-D03): solo `species` es un param REAL del endpoint
 * (`fetchPublicAnimals`); todos los filtros (incluida especie) se resuelven
 * ahora EN EL CLIENTE sobre el pool ya cargado — ningún fetch lleva
 * `species` nunca (ni el inicial ni "cargar más").
 */
function animal(id: string, name: string, over: Partial<AnimalSummary> = {}): AnimalSummary {
  return {
    id,
    organizationId: 'org-1',
    name,
    species: 'dog',
    sex: 'male',
    size: 'medium',
    status: 'available',
    ...over,
  };
}

function stubAnimals(body: unknown) {
  return vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body }));
}

function renderSection() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PortalAdoptionSection slug="patitas" />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalAdoptionSection', () => {
  it('renders a card per item read from the wrapped `.items`', async () => {
    vi.stubGlobal(
      'fetch',
      stubAnimals({
        items: [animal('a1', 'Firulais'), animal('a2', 'Michi', { species: 'cat' })],
        total: 2,
        limit: 12,
        offset: 0,
      }),
    );
    renderSection();

    const cards = await screen.findAllByTestId('animal-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText('Michi')).toBeInTheDocument();
  });

  it('shows an explicit empty state for a wrapped-empty response (no throw)', async () => {
    vi.stubGlobal('fetch', stubAnimals({ items: [], total: 0, limit: 12, offset: 0 }));
    renderSection();
    expect(
      await screen.findByText('Esta organización no tiene animales en adopción ahora.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('animal-card')).not.toBeInTheDocument();
  });

  it('T-028c regression: a NON-array body normalizes to [] → empty state, never .map throws', async () => {
    vi.stubGlobal('fetch', stubAnimals({ items: null, total: 0 }));
    renderSection();
    expect(
      await screen.findByText('Esta organización no tiene animales en adopción ahora.'),
    ).toBeInTheDocument();
  });

  it('filters by species instantly on the client — no re-fetch, no `species` param ever sent', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      void url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          items: [animal('a1', 'Firulais'), animal('a2', 'Michi', { species: 'cat' })],
          total: 2,
          limit: 12,
          offset: 0,
        }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    expect(await screen.findAllByTestId('animal-card')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Gato' }));

    await waitFor(() => {
      expect(screen.getByText('Michi')).toBeInTheDocument();
      expect(screen.queryByText('Firulais')).not.toBeInTheDocument();
    });

    // A single fetch total (the initial load) — the species filter never re-hits the API.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).not.toContain('species=');
  });

  it('filters by search text (name or breed) instantly on the client', async () => {
    vi.stubGlobal(
      'fetch',
      stubAnimals({
        items: [
          animal('a1', 'Firulais', { breed: 'Criollo' }),
          animal('a2', 'Michi', { species: 'cat', breed: 'Siames' }),
        ],
        total: 2,
        limit: 12,
        offset: 0,
      }),
    );
    renderSection();

    expect(await screen.findAllByTestId('animal-card')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Buscar por nombre o raza'), {
      target: { value: 'siames' },
    });

    await waitFor(() => {
      expect(screen.getByText('Michi')).toBeInTheDocument();
      expect(screen.queryByText('Firulais')).not.toBeInTheDocument();
    });
  });

  it('shows a distinct "sin resultados" empty state when filters exclude every loaded item', async () => {
    vi.stubGlobal(
      'fetch',
      stubAnimals({ items: [animal('a1', 'Firulais')], total: 1, limit: 12, offset: 0 }),
    );
    renderSection();

    await screen.findByTestId('animal-card');
    fireEvent.click(screen.getByRole('button', { name: 'Gato' }));

    expect(
      await screen.findByText('Ningún animal coincide con los filtros elegidos.'),
    ).toBeInTheDocument();
  });
});
