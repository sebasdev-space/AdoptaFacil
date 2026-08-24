import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';

function sessionWith() {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'vis-1',
        name: 'Visitante',
        email: 'visitante@test.local',
        roles: [],
        organizationId: 'org-self',
        accountType: 'person' as const,
      },
    },
  };
}

function stubFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const body = handler(String(input));
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

describe('MyReviewsPage (RF23)', () => {
  it('shows an empty state when there are no reviews yet', async () => {
    stubFetch(() => []);
    renderShell({ route: '/resenas', ...sessionWith() });

    expect(await screen.findByText('Aún no has enviado ninguna reseña.')).toBeInTheDocument();
  });

  it('lists each review with its organization, status and rejection reason', async () => {
    stubFetch((url) => {
      if (url.includes('/reviews/mine')) {
        return [
          {
            id: 'r1',
            organizationId: 'org-1',
            organizationName: 'Refugio Patitas',
            authorUserId: 'vis-1',
            rating: 5,
            comment: 'Excelente organización',
            isAnonymous: false,
            status: 'approved',
            createdAt: '2026-08-01T00:00:00.000Z',
          },
          {
            id: 'r2',
            organizationId: 'org-2',
            organizationName: 'Otro Refugio',
            authorUserId: 'vis-1',
            rating: 2,
            isAnonymous: false,
            status: 'rejected',
            rejectionReason: 'Contenido inapropiado',
            createdAt: '2026-08-02T00:00:00.000Z',
          },
        ];
      }
      return {};
    });
    renderShell({ route: '/resenas', ...sessionWith() });

    expect(await screen.findByText(/Refugio Patitas/)).toBeInTheDocument();
    expect(screen.getByText('Excelente organización')).toBeInTheDocument();
    expect(screen.getByText('Aprobada')).toBeInTheDocument();

    expect(screen.getByText(/Otro Refugio/)).toBeInTheDocument();
    expect(screen.getByText('Rechazada')).toBeInTheDocument();
    expect(screen.getByText(/Contenido inapropiado/)).toBeInTheDocument();
  });
});
