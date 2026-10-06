import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ClinicalEventType,
  Role,
  type Animal,
  type ClinicalCarnetEntry,
  type ClinicalEvent,
} from '@adoptafacil/contracts';
import { AppProviders } from '../../../shell/app-providers';
import { AnimalClinicalPanel } from './animal-clinical-panel';

/**
 * S2-04B-2 — the new "Carnet" tab is ADDITIVE inside the existing panel: the
 * "Registro" tab (pre-existing flat list) must keep rendering exactly as
 * before (regresión cero) while "Carnet" adds the author-enriched timeline +
 * PDF download, fetched from a SEPARATE endpoint (`.../clinical-events/carnet`).
 */
function providers(roles: Role[], children: React.ReactNode) {
  return (
    <AppProviders
      session={{
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u1',
          name: 'Dra. Ana',
          email: 'vet@refugio.org',
          roles,
          organizationId: 'org-1',
          accountType: 'organization',
        },
      }}
    >
      {children}
    </AppProviders>
  );
}

function event(overrides: Partial<ClinicalEvent> = {}): ClinicalEvent {
  return {
    id: 'ev-1',
    eventId: 'logical-1',
    organizationId: 'org-1',
    animalId: 'animal-1',
    type: ClinicalEventType.Vaccine,
    occurredAt: '2026-06-01T00:00:00.000Z',
    details: {},
    version: 1,
    authorUserId: 'u1',
    attachments: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function carnetEntry(overrides: Partial<ClinicalCarnetEntry> = {}): ClinicalCarnetEntry {
  return { ...event(), authorName: 'Dra. Ana', ...overrides };
}

function animal(overrides: Partial<Animal> = {}): Animal {
  return {
    id: 'animal-1',
    organizationId: 'org-1',
    name: 'Firulais',
    species: 'dog',
    sex: 'male',
    size: 'medium',
    status: 'available',
    photos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Routes the 4 real endpoints the panel now fetches (S2-04B-2-REV added the
 *  bare `/animals/:id` and `.../:eventId/history` cases) — order matters:
 *  more specific paths must be checked before the generic clinical-events one. */
function stubFetch(routes: {
  animal?: Animal;
  events?: ClinicalEvent[];
  carnet?: ClinicalCarnetEntry[];
  history?: ClinicalEvent[];
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown = [];
      if (url.endsWith('/history')) body = routes.history ?? [];
      else if (url.endsWith('/carnet')) body = routes.carnet ?? [];
      else if (url.includes('/clinical-events')) body = routes.events ?? [];
      else body = routes.animal ?? animal();
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => body,
        blob: async () => new Blob(['%PDF-1.4 mock']),
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('AnimalClinicalPanel — Registro tab (regresión, pre-existing behavior)', () => {
  it('still lists the current-version events exactly as before (unaffected by the carnet fetch)', async () => {
    stubFetch({ events: [event({ type: ClinicalEventType.Surgery })] });
    render(providers([Role.Veterinarian], <AnimalClinicalPanel animalId="animal-1" />));

    const registro = await screen.findByRole('tabpanel', { name: 'Registro' });
    expect(await within(registro).findByText('Cirugía')).toBeInTheDocument();
    expect(within(registro).getByText('v1')).toBeInTheDocument();
  });

  it('shows the pre-existing empty state text when there are no events', async () => {
    stubFetch({});
    render(providers([Role.Owner], <AnimalClinicalPanel animalId="animal-1" />));
    const registro = await screen.findByRole('tabpanel', { name: 'Registro' });
    expect(await within(registro).findByText('Sin eventos clínicos.')).toBeInTheDocument();
  });
});

describe('AnimalClinicalPanel — Carnet tab (S2-04B-2)', () => {
  it('shows the timeline with author name and a PDF download button', async () => {
    stubFetch({
      carnet: [carnetEntry({ type: ClinicalEventType.Vaccine, authorName: 'Dra. Ana' })],
    });
    render(providers([Role.Veterinarian], <AnimalClinicalPanel animalId="animal-1" />));

    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Carnet' }));

    const carnet = await screen.findByRole('tabpanel', { name: 'Carnet' });
    expect(await within(carnet).findByText('Vacuna')).toBeInTheDocument();
    expect(within(carnet).getByText('Autor: Dra. Ana')).toBeInTheDocument();
    expect(within(carnet).getByRole('button', { name: /Descargar carnet/ })).toBeInTheDocument();
  });

  it('shows a friendly empty state (not an error) when there are no clinical events', async () => {
    stubFetch({});
    render(providers([Role.Owner], <AnimalClinicalPanel animalId="animal-1" />));

    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Carnet' }));

    const carnet = await screen.findByRole('tabpanel', { name: 'Carnet' });
    expect(
      await within(carnet).findByText('Sin eventos clínicos registrados todavía.'),
    ).toBeInTheDocument();
  });
});

describe('AnimalClinicalPanel — Carnet header: foto/nombre/edad (S2-04B-2-REV)', () => {
  it('shows the animal name and derived age above the timeline', async () => {
    stubFetch({
      animal: animal({
        name: 'Firulais',
        computedAge: { years: 2, months: 3, totalMonths: 27, approximate: false },
      }),
      carnet: [carnetEntry()],
    });
    render(providers([Role.Veterinarian], <AnimalClinicalPanel animalId="animal-1" />));

    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Carnet' }));

    const carnet = await screen.findByRole('tabpanel', { name: 'Carnet' });
    expect(await within(carnet).findByText('Firulais')).toBeInTheDocument();
    expect(within(carnet).getByText('2 a 3 m')).toBeInTheDocument();
  });

  it('falls back to "Edad desconocida" when the animal has no computed age', async () => {
    stubFetch({ animal: animal({ name: 'Michi' }), carnet: [carnetEntry()] });
    render(providers([Role.Veterinarian], <AnimalClinicalPanel animalId="animal-1" />));

    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Carnet' }));

    const carnet = await screen.findByRole('tabpanel', { name: 'Carnet' });
    expect(await within(carnet).findByText('Michi')).toBeInTheDocument();
    expect(within(carnet).getByText('Edad desconocida')).toBeInTheDocument();
  });
});

describe('AnimalClinicalPanel — historial de ediciones por evento (S2-04B-2-REV)', () => {
  it('offers no history control for an event that was never edited (version 1)', async () => {
    stubFetch({ carnet: [carnetEntry({ version: 1 })] });
    render(providers([Role.Veterinarian], <AnimalClinicalPanel animalId="animal-1" />));

    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Carnet' }));

    const carnet = await screen.findByRole('tabpanel', { name: 'Carnet' });
    await within(carnet).findByText('Vacuna');
    expect(screen.queryByText('Ver ediciones anteriores')).not.toBeInTheDocument();
  });

  it('fetches and shows prior versions via the real .../:eventId/history endpoint on demand', async () => {
    stubFetch({
      carnet: [carnetEntry({ id: 'ev-v2', version: 2, type: ClinicalEventType.Treatment })],
      history: [
        event({ id: 'ev-v1', eventId: 'logical-1', version: 1, type: ClinicalEventType.Vaccine }),
        event({ id: 'ev-v2', eventId: 'logical-1', version: 2, type: ClinicalEventType.Treatment }),
      ],
    });
    render(providers([Role.Veterinarian], <AnimalClinicalPanel animalId="animal-1" />));

    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Carnet' }));

    const carnet = await screen.findByRole('tabpanel', { name: 'Carnet' });
    await user.click(await within(carnet).findByText('Ver ediciones anteriores'));

    // Only the PRIOR version (v1) should render — the current one (v2, ev-v2)
    // is already shown by the entry itself and must not be duplicated.
    expect(await within(carnet).findByText(/v1/)).toBeInTheDocument();
    expect(within(carnet).getByText(/Vacuna/)).toBeInTheDocument();
    expect(within(carnet).queryAllByText(/v2/)).toHaveLength(0);

    await user.click(within(carnet).getByText('Ocultar ediciones anteriores'));
    expect(within(carnet).queryByText(/v1/)).not.toBeInTheDocument();
  });

  it('does not affect the Registro tab or the PDF button (regresión cero)', async () => {
    stubFetch({
      events: [event({ type: ClinicalEventType.Surgery })],
      carnet: [carnetEntry({ version: 3 })],
    });
    render(providers([Role.Veterinarian], <AnimalClinicalPanel animalId="animal-1" />));

    const registro = await screen.findByRole('tabpanel', { name: 'Registro' });
    expect(await within(registro).findByText('Cirugía')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Carnet' }));
    const carnet = await screen.findByRole('tabpanel', { name: 'Carnet' });
    expect(within(carnet).getByRole('button', { name: /Descargar carnet/ })).toBeInTheDocument();
  });
});

describe('AnimalClinicalPanel — Registrar evento clínico: rol ampliado + adjuntos reales (fix, T-ANIMALS-ATTACHMENTS-AUDIT)', () => {
  it('shows "Registrar evento clínico" for an Owner (role widened — previously Veterinarian-only)', async () => {
    stubFetch({});
    render(providers([Role.Owner], <AnimalClinicalPanel animalId="animal-1" />));

    expect(await screen.findByText('Registrar evento clínico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeInTheDocument();
  });

  it('never shows the registration form for a role without write access (ReadOnlyAuditor)', async () => {
    stubFetch({});
    render(providers([Role.ReadOnlyAuditor], <AnimalClinicalPanel animalId="animal-1" />));

    await screen.findByText('Sin eventos clínicos.');
    expect(screen.queryByText('Registrar evento clínico')).not.toBeInTheDocument();
  });

  it('uploads a real file end-to-end (reserve → PUT bytes → create with storageRef), not a bare filename text field', async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method, body: init?.body });
        if (init?.method === 'POST' && url.endsWith('/clinical-events/uploads')) {
          return Promise.resolve({
            ok: true,
            status: 201,
            headers: { get: () => null },
            json: async () => ({ key: 'private/org-1/uuid-examen.pdf', url: 'http://x/upload' }),
          });
        }
        if (init?.method === 'PUT' && url.includes('/storage/upload')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({}),
          });
        }
        if (init?.method === 'POST' && url.endsWith('/clinical-events')) {
          return Promise.resolve({
            ok: true,
            status: 201,
            headers: { get: () => null },
            json: async () => event({ id: 'new-ev', attachments: [] }),
          });
        }
        let body: unknown = [];
        if (url.endsWith('/history')) body = [];
        else if (url.endsWith('/carnet')) body = [];
        else if (url.includes('/clinical-events')) body = [];
        else body = animal();
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => body,
        });
      }),
    );

    render(providers([Role.Owner], <AnimalClinicalPanel animalId="animal-1" />));
    await screen.findByText('Registrar evento clínico');

    const user = userEvent.setup();
    const file = new File(['%PDF-1.4'], 'examen.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText('Adjuntar archivo (PDF o imagen)', {
      selector: 'input',
    }) as HTMLInputElement;
    await user.upload(input, file);
    expect(await screen.findByText('examen.pdf')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Fecha del evento'), '2026-09-01');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(
        calls.some((c) => c.method === 'POST' && c.url.endsWith('/clinical-events/uploads')),
      ).toBe(true);
      expect(calls.some((c) => c.method === 'PUT' && c.url.includes('/storage/upload'))).toBe(true);
    });
    const create = calls.find((c) => c.method === 'POST' && c.url.endsWith('/clinical-events'));
    expect(create).toBeDefined();
    const createBody = JSON.parse(String(create?.body));
    expect(createBody.attachments).toEqual([
      { storageRef: 'private/org-1/uuid-examen.pdf', order: 0 },
    ]);
  });
});
