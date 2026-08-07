import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AnimalSummary } from '@adoptafacil/contracts';
import { PublicAnimalDetailPage } from './public-animal-detail-page';

/**
 * §M14/M03 (T-052) — public animal detail. Public fields only (never clinical
 * record/reminders/documents) + a "Solicitar adopción" CTA into the T-028a flow.
 *
 * F-LANDING-02: an animal is reached from BOTH the general portal (`/`) and its
 * org's portal (`/o/:slug`), so the page offers two exits — "Volver al inicio"
 * (always present, no fetch needed) and "Ver {org name}" (independent,
 * best-effort fetch of the org's public profile; absent if it fails/never a
 * generic label).
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

// F-EDAD-DETALLE: a 1-year-old, non-approximate animal — ageLabel() renders
// this as "1 año" (see animals-catalog.test.ts), same string AnimalCard shows
// in the catalog for an identical computedAge.
const ANIMAL_WITH_AGE: AnimalSummary = {
  ...ANIMAL,
  computedAge: { years: 1, months: 0, totalMonths: 12, approximate: false },
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

/** Discriminates by URL: the org PROFILE endpoint vs. the animals CATALOG one
 *  (they're different fetches, different shapes — see PublicAnimalDetailPage). */
function stubByUrl(profileBody: unknown, animalsBody: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: RequestInfo | URL) => {
      const isProfile = !String(url).includes('/animals');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => (isProfile ? profileBody : animalsBody),
      });
    }),
  );
}

// Every test either overrides this via stubAnimals/stubByUrl, or relies on
// nav-state to skip the animal fetch — but the org-NAME fetch always fires
// regardless of nav-state, so fetch must never be left unstubbed.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
  );
});

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

    // F1-03+: hierarchy — "Solicitar adopción" stays the SOLID, protagonist
    // button; "Volver al inicio" is a SECONDARY (outline) button, never solid.
    expect(cta.className).toContain('bg-primary');
    const backLink = screen.getByRole('link', { name: '← Volver al inicio' });
    expect(backLink.className).toContain('border-input');
    expect(backLink.className).not.toContain('bg-primary');
  });

  it('F-CTA-APADRINAR: shows an "Apadrinar" CTA linking to /apadrinar with the animal id and name', () => {
    renderDetail({ state: { animal: ANIMAL } });

    const cta = screen.getByTestId('sponsor-animal-cta');
    const href = cta.getAttribute('href') ?? '';
    expect(href).toContain('/apadrinar?');
    expect(href).toContain('animalId=a1');
    expect(href).toContain('animalName=Firulais');
    // No org name resolved yet at this point — never a stale/generic value.
    expect(href).not.toContain('organizationName');

    // Secondary CTA (outline) — "Solicitar adopción" stays the sole solid/primary one.
    expect(cta.className).not.toContain('bg-primary');
  });

  it('F-CTA-APADRINAR: includes organizationName in the href once the org profile resolves', async () => {
    stubByUrl({ name: 'Fundación Patitas' }, { items: [ANIMAL], total: 1, limit: 50, offset: 0 });
    renderDetail({ state: { animal: ANIMAL } });

    await screen.findByRole('link', { name: 'Ver Fundación Patitas' });
    const cta = screen.getByTestId('sponsor-animal-cta');
    expect(cta.getAttribute('href') ?? '').toContain('organizationName=Fundaci%C3%B3n+Patitas');
  });

  it('F-CTA-APADRINAR: absent in the not-found state, same as "Solicitar adopción"', async () => {
    stubAnimals({ items: [], total: 0, limit: 50, offset: 0 });
    renderDetail();
    await screen.findByText('Animal no encontrado');
    expect(screen.queryByTestId('sponsor-animal-cta')).not.toBeInTheDocument();
  });

  it('F-EDAD-DETALLE: shows the age via ageLabel() ("1 año"), same string AnimalCard renders — never raw totalMonths', () => {
    renderDetail({ state: { animal: ANIMAL_WITH_AGE } });

    expect(screen.getByText('1 año')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ meses$/)).not.toBeInTheDocument();
  });

  it('F-EDAD-DETALLE: a fresh/clamped-to-zero computedAge renders "< 1 mes", never "0 meses"', () => {
    renderDetail({
      state: {
        animal: {
          ...ANIMAL,
          computedAge: { years: 0, months: 0, totalMonths: 0, approximate: false },
        },
      },
    });

    expect(screen.getByText('< 1 mes')).toBeInTheDocument();
    expect(screen.queryByText('0 meses')).not.toBeInTheDocument();
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

  it('F-LANDING-02: always shows "Volver al inicio" (→ /), even before the org name loads', () => {
    renderDetail({ state: { animal: ANIMAL } });
    expect(screen.getByRole('link', { name: '← Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('F-LANDING-02: shows "Ver {org name}" (→ /o/:slug) once the org profile resolves — never a generic label', async () => {
    stubByUrl({ name: 'Fundación Patitas' }, { items: [ANIMAL], total: 1, limit: 50, offset: 0 });
    renderDetail({ state: { animal: ANIMAL } });

    expect(screen.getByRole('link', { name: '← Volver al inicio' })).toHaveAttribute('href', '/');
    const orgLink = await screen.findByRole('link', { name: 'Ver Fundación Patitas' });
    expect(orgLink).toHaveAttribute('href', '/o/patitas');
    // Never a generic fallback label while/if the name is unavailable.
    expect(screen.queryByRole('link', { name: /^Ver$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Ver organización')).not.toBeInTheDocument();
  });

  it('F-LANDING-02: "Ver {org}" stays absent (never generic) when the org profile fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderDetail({ state: { animal: ANIMAL } });

    expect(screen.getByRole('link', { name: '← Volver al inicio' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/^Ver /)).not.toBeInTheDocument();
  });
});
