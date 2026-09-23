import { screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * `/organizacion/documentos` (M01, S-10 — FSD v3.5 Sección A). Cubre lo que
 * el FSD exige y que antes de S-10 estaba roto o ausente:
 * (a) "% completado" real, derivado por el backend (nunca inventado aquí);
 * (b) el CTA "Siguiente paso" que apunta al documento concreto que falta;
 * (c) la distinción visual/textual OBSERVADO (corregible) vs RECHAZADO
 *     (empezar de nuevo) — antes de este PR compartían el mismo estilo.
 */
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'owner-1',
        name: 'Dueña',
        email: 'duena@patitas.org',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
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
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OrgDocumentsPage (M01, S-10: FSD v3.5 Sección A)', () => {
  it('shows 0% completado and the upload-first hint with no documents yet', async () => {
    stubFetch((url) => {
      if (url.includes('/org/documents/verification')) {
        return { level: 0, criteria: [], percentComplete: 0 };
      }
      if (url.includes('/org/documents')) return [];
      return null;
    });
    renderShell({ route: '/organizacion/documentos', ...sessionWith([Role.Owner]) });

    expect(
      await screen.findByText('Sube tus documentos para iniciar la verificación. 0% completado.'),
    ).toBeInTheDocument();
  });

  it('shows the real percent and a "Siguiente paso" CTA for the next required document', async () => {
    stubFetch((url) => {
      if (url.includes('/org/documents/verification')) {
        return {
          level: 1,
          label: 'Básico',
          criteria: ['rut:approved'],
          nextLevel: 2,
          blockedBy: ['existence_representation_certificate'],
          percentComplete: 50,
        };
      }
      if (url.includes('/org/documents')) return [];
      return null;
    });
    renderShell({ route: '/organizacion/documentos', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('50% completado')).toBeInTheDocument();
    expect(
      screen.getByText('Siguiente paso: sube Certificado de existencia y representación legal'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Subir documento' }));
    expect(
      screen.getByRole('heading', {
        name: 'Subir Certificado de existencia y representación legal',
      }),
    ).toBeInTheDocument();
  });

  it('does NOT show a "Siguiente paso" CTA once fully verified (nothing blocking)', async () => {
    stubFetch((url) => {
      if (url.includes('/org/documents/verification')) {
        return { level: 2, label: 'Verificada', criteria: [], percentComplete: 100 };
      }
      if (url.includes('/org/documents')) return [];
      return null;
    });
    renderShell({ route: '/organizacion/documentos', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('100% completado')).toBeInTheDocument();
    expect(screen.queryByText(/Siguiente paso/)).not.toBeInTheDocument();
  });

  it('distinguishes OBSERVADO (corregible) de RECHAZADO (empezar de nuevo) — texto y acción distintos', async () => {
    const observed = {
      id: 'doc-observed',
      organizationId: 'org-1',
      type: 'rut',
      storageRef: 'private/org-1/rut-v1',
      version: 1,
      status: 'observed',
      reviewNote: 'La imagen está borrosa',
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    const rejected = {
      id: 'doc-rejected',
      organizationId: 'org-1',
      type: 'existence_representation_certificate',
      storageRef: 'private/org-1/cert-v1',
      version: 1,
      status: 'rejected',
      reviewNote: 'Corresponde a otra organización',
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    stubFetch((url) => {
      if (url.includes('/org/documents/verification')) {
        return { level: 0, criteria: [], percentComplete: 0 };
      }
      if (url.includes('/org/documents')) return [observed, rejected];
      return null;
    });
    renderShell({ route: '/organizacion/documentos', ...sessionWith([Role.Owner]) });

    expect(
      await screen.findByText(/Necesita corrección: La imagen está borrosa/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Rechazado — no es válido para este requisito: Corresponde a otra organización/,
      ),
    ).toBeInTheDocument();

    // Distinct actions: "Subsanar" (edit the same thing) vs "Cargar documento
    // nuevo" (start over) — never the same generic "Actualizar" for both.
    expect(screen.getByRole('button', { name: 'Subsanar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargar documento nuevo' })).toBeInTheDocument();
  });
});
