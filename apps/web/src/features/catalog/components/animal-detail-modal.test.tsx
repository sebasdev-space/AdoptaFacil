import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { PublicAnimalSummary } from '@adoptafacil/contracts';
import { AnimalDetailModal } from './animal-detail-modal';

const ANIMAL: PublicAnimalSummary = {
  id: 'a1',
  organizationId: 'org-1',
  name: 'Michi',
  species: 'cat',
  sex: 'male',
  size: 'medium',
  status: 'available',
  organization: {
    id: 'org-1',
    name: 'CatCompany',
    slug: 'catcompany',
    logoUrl: 'https://cdn.test/logo.png',
    city: 'Bogotá',
  },
};

beforeEach(() => {
  // El resumen de apadrinamiento no es el foco aquí: sin planes activos.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ animalId: 'a1', activePlans: [], activeSponsorCount: 0 }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AnimalDetailModal', () => {
  it('offers "Donar" linking to /donaciones with the animal’s organization', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AnimalDetailModal animal={ANIMAL} onOpenChange={() => undefined} />
      </MemoryRouter>,
    );

    const cta = screen.getByTestId('donate-organization-cta');
    const href = cta.getAttribute('href') ?? '';
    expect(href).toContain('/donaciones?');
    expect(href).toContain('organizationId=org-1');
    expect(href).toContain('organizationName=CatCompany');
    expect(href).toContain('organizationCity=Bogot%C3%A1');
  });
});
