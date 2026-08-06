import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ClinicalEventType,
  Role,
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
        blob: async () => new Blob(['%PDF-1.4 mock']),
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('AnimalClinicalPanel — Registro tab (regresión, pre-existing behavior)', () => {
  it('still lists the current-version events exactly as before (unaffected by the carnet fetch)', async () => {
    stubFetch((url) => {
      if (url.endsWith('/carnet')) return [];
      if (url.includes('/clinical-events')) return [event({ type: ClinicalEventType.Surgery })];
      return [];
    });
    render(providers([Role.Veterinarian], <AnimalClinicalPanel animalId="animal-1" />));

    const registro = await screen.findByRole('tabpanel', { name: 'Registro' });
    expect(within(registro).getByText('Cirugía')).toBeInTheDocument();
    expect(within(registro).getByText('v1')).toBeInTheDocument();
  });

  it('shows the pre-existing empty state text when there are no events', async () => {
    stubFetch(() => []);
    render(providers([Role.Owner], <AnimalClinicalPanel animalId="animal-1" />));
    const registro = await screen.findByRole('tabpanel', { name: 'Registro' });
    expect(within(registro).getByText('Sin eventos clínicos.')).toBeInTheDocument();
  });
});

describe('AnimalClinicalPanel — Carnet tab (S2-04B-2)', () => {
  it('shows the timeline with author name and a PDF download button', async () => {
    stubFetch((url) => {
      if (url.endsWith('/carnet')) {
        return [carnetEntry({ type: ClinicalEventType.Vaccine, authorName: 'Dra. Ana' })];
      }
      if (url.includes('/clinical-events')) return [];
      return [];
    });
    render(providers([Role.Veterinarian], <AnimalClinicalPanel animalId="animal-1" />));

    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Carnet' }));

    const carnet = await screen.findByRole('tabpanel', { name: 'Carnet' });
    expect(within(carnet).getByText('Vacuna')).toBeInTheDocument();
    expect(within(carnet).getByText('Autor: Dra. Ana')).toBeInTheDocument();
    expect(within(carnet).getByRole('button', { name: /Descargar carnet/ })).toBeInTheDocument();
  });

  it('shows a friendly empty state (not an error) when there are no clinical events', async () => {
    stubFetch(() => []);
    render(providers([Role.Owner], <AnimalClinicalPanel animalId="animal-1" />));

    const user = userEvent.setup();
    await user.click(await screen.findByRole('tab', { name: 'Carnet' }));

    const carnet = await screen.findByRole('tabpanel', { name: 'Carnet' });
    expect(
      within(carnet).getByText('Sin eventos clínicos registrados todavía.'),
    ).toBeInTheDocument();
  });
});
