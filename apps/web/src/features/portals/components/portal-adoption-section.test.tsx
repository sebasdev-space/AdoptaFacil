import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { AnimalSummary } from '@adoptafacil/contracts';
import { PortalAdoptionSection } from './portal-adoption-section';

/**
 * §M14/M03 (T-052) — the public "Mascotas en adopción" section. The endpoint returns
 * a WRAPPED page ({ items, total, limit, offset }); the section must read `.items`,
 * normalize a non-array to [], and NEVER `.map` over a non-array (explicit regression
 * of the T-028c `.map` bug). Rendered under a router for the card links.
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
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
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
    stubAnimals({
      items: [animal('a1', 'Firulais'), animal('a2', 'Michi', { species: 'cat' })],
      total: 2,
      limit: 12,
      offset: 0,
    });
    renderSection();

    const cards = await screen.findAllByTestId('animal-card');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText('Michi')).toBeInTheDocument();
  });

  it('shows an explicit empty state for a wrapped-empty response (no throw)', async () => {
    stubAnimals({ items: [], total: 0, limit: 12, offset: 0 });
    renderSection();
    expect(
      await screen.findByText('Esta organización no tiene animales en adopción ahora.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('animal-card')).not.toBeInTheDocument();
  });

  it('T-028c regression: a NON-array body normalizes to [] → empty state, never .map throws', async () => {
    // Body without a real `items` array (e.g. an unexpected shape). Must not crash.
    stubAnimals({ items: null, total: 0 });
    renderSection();
    expect(
      await screen.findByText('Esta organización no tiene animales en adopción ahora.'),
    ).toBeInTheDocument();
  });

  it('filters by species using the REAL endpoint param (species=cat)', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      void url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [], total: 0 }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderSection();

    // Initial load (all species) resolved to the empty state.
    await screen.findByText('Esta organización no tiene animales en adopción ahora.');
    fireEvent.click(screen.getByRole('button', { name: 'Gato' }));

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('species=cat'))).toBe(true);
    });
  });
});
