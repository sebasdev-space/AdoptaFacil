import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClinicalEventType, Role, type ClinicalEvent } from '@adoptafacil/contracts';
import { AppProviders } from '../../../shell/app-providers';
import { AnimalDocumentosSection } from './animal-documentos-section';
import * as storage from '../lib/storage';

/**
 * Fix (T-ANIMALS-ATTACHMENTS-AUDIT): el tab "Documentos" dejó de ser un
 * `ComingSoon` — ahora es la galería consolidada de los adjuntos reales del
 * expediente clínico (fotos, exámenes, carnet), cada uno descargable.
 */
function providers(children: React.ReactNode) {
  return (
    <AppProviders
      session={{
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u1',
          name: 'Owner',
          email: 'owner@refugio.org',
          roles: [Role.Owner],
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

function stubFetch(events: ClinicalEvent[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown = [];
      if (url.includes('/clinical-events')) body = events;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => body,
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('AnimalDocumentosSection (fix, T-ANIMALS-ATTACHMENTS-AUDIT)', () => {
  it('shows an empty state when no clinical event has any attachment', async () => {
    stubFetch([event({ attachments: [] })]);
    render(providers(<AnimalDocumentosSection animalId="animal-1" />));

    expect(await screen.findByText('Sin documentos todavía')).toBeInTheDocument();
  });

  it('lists every attachment across all events, with its event type and date', async () => {
    stubFetch([
      event({
        type: ClinicalEventType.Vaccine,
        occurredAt: '2026-06-01T00:00:00.000Z',
        attachments: [
          { id: 'att-1', storageRef: 'private/org-1/uuid-carnet.pdf', order: 0, url: 'x' },
        ],
      }),
      event({
        id: 'ev-2',
        eventId: 'logical-2',
        type: ClinicalEventType.Surgery,
        occurredAt: '2026-07-01T00:00:00.000Z',
        attachments: [
          { id: 'att-2', storageRef: 'private/org-1/uuid-examen.pdf', order: 0, url: 'x' },
        ],
      }),
    ]);
    render(providers(<AnimalDocumentosSection animalId="animal-1" />));

    expect(await screen.findByText('Vacuna')).toBeInTheDocument();
    expect(screen.getByText('Cirugía')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Descargar' })).toHaveLength(2);
  });

  it('downloads the attachment (private, authenticated) when "Descargar" is clicked', async () => {
    stubFetch([
      event({
        attachments: [
          { id: 'att-1', storageRef: 'private/org-1/uuid-carnet.pdf', order: 0, url: 'x' },
        ],
      }),
    ]);
    const spy = vi.spyOn(storage, 'downloadPrivateFile').mockResolvedValue();
    render(providers(<AnimalDocumentosSection animalId="animal-1" />));

    fireEvent.click(await screen.findByRole('button', { name: 'Descargar' }));

    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      'private/org-1/uuid-carnet.pdf',
      'uuid-carnet.pdf',
    );
    spy.mockRestore();
  });
});
