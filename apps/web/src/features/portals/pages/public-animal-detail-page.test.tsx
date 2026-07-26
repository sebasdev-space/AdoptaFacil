import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AnimalSummary } from '@adoptafacil/contracts';
import { PublicAnimalDetailPage } from './public-animal-detail-page';

/**
 * §M14/M03 (T-052) — public animal detail. Public fields only (never clinical
 * record/reminders/documents) + a "Solicitar adopción" CTA into the T-028a flow.
 */
const ANIMAL: AnimalSummary = {
  id: 'a1',
  organizationId: 'org-1',
  name: 'Firulais',
  species: 'dog',
  sex: 'male',
  size: 'medium',
  status: 'available',
  photoUrl: 'https://cdn.test/firulais.jpg',
  breed: 'Criollo',
};

function renderDetail(options: { state?: { animal: AnimalSummary } } = {}) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/o/patitas/animales/a1', state: options.state ?? null }]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/o/:slug/animales/:animalId" element={<PublicAnimalDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function stubAnimals(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicAnimalDetailPage', () => {
  it('renders the public info from nav-state (no refetch) with a "Solicitar adopción" CTA', () => {
    renderDetail({ state: { animal: ANIMAL } });

    expect(screen.getByTestId('public-animal-detail')).toBeInTheDocument();
    expect(screen.getByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText('Perro')).toBeInTheDocument();
    expect(screen.getByText('Macho')).toBeInTheDocument();
    expect(screen.getByText('Mediano')).toBeInTheDocument();

    const cta = screen.getByTestId('request-adoption-cta');
    const href = cta.getAttribute('href') ?? '';
    expect(href).toContain('/adopciones/solicitar?');
    expect(href).toContain('organizationId=org-1');
    expect(href).toContain('animalId=a1');
    expect(href).toContain('species=dog');
  });

  it('never exposes internal/clinical data (M03 internal surface)', () => {
    renderDetail({ state: { animal: ANIMAL } });
    // Only public AnimalSummary fields are ever shown — no clinical record surface.
    expect(screen.queryByText(/expediente|historia cl[ií]nica|vacun|recordatorio/i)).toBeNull();
  });

  it('resolves the animal from the public catalog on a deep link (no nav-state)', async () => {
    stubAnimals({ items: [ANIMAL], total: 1, limit: 50, offset: 0 });
    renderDetail();
    expect(await screen.findByTestId('public-animal-detail')).toBeInTheDocument();
    expect(screen.getByText('Firulais')).toBeInTheDocument();
  });

  it('shows a not-found state when the animal is not in the public catalog', async () => {
    stubAnimals({ items: [], total: 0, limit: 50, offset: 0 });
    renderDetail();
    expect(await screen.findByText('Animal no encontrado')).toBeInTheDocument();
    expect(screen.queryByTestId('request-adoption-cta')).not.toBeInTheDocument();
  });
});
