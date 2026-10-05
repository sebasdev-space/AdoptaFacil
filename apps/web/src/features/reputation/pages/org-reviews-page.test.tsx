import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * `/organizacion/resenas` (fix, M12/S7-b): "se pueden registrar [reseñas]
 * desde el portal público pero no se pueden ver al momento que accedo al
 * módulo de reseñas desde usuario owner" — `POST /reviews/:id/mark-spam` ya
 * existía, pero no había ninguna página desde donde encontrar el id de una
 * reseña para poder usarlo. Esta página lo resuelve.
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
        organizationId: 'org-self',
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

afterEach(() => vi.unstubAllGlobals());

describe('OrgReviewsPage (fix: Owner could mark-spam but had nothing to find an id with)', () => {
  it('denies a non-Owner/Administrator role (deny-by-default)', async () => {
    stubFetch(() => []);
    renderShell({ route: '/organizacion/resenas', ...sessionWith([Role.Operator]) });

    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });

  it('shows an empty state when the org has no public reviews yet', async () => {
    stubFetch(() => []);
    renderShell({ route: '/organizacion/resenas', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Aún no has recibido ninguna reseña.')).toBeInTheDocument();
  });

  it('lists the org\'s public reviews with status, and a "Marcar como spam" button only on approved ones', async () => {
    stubFetch((url) => {
      if (url.includes('/reviews/org')) {
        return [
          {
            id: 'rev-1',
            organizationId: 'org-self',
            rating: 1,
            comment: 'Enlace sospechoso: compra aquí barato',
            isAnonymous: true,
            status: 'approved',
            createdAt: '2026-09-29T00:00:00.000Z',
          },
          {
            id: 'rev-2',
            organizationId: 'org-self',
            rating: 5,
            comment: 'Excelente labor con los animales',
            isAnonymous: true,
            status: 'hidden',
            rejectionReason: 'spam',
            createdAt: '2026-09-20T00:00:00.000Z',
          },
        ];
      }
      return {};
    });
    renderShell({ route: '/organizacion/resenas', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText(/Enlace sospechoso/)).toBeInTheDocument();
    expect(screen.getByText(/Excelente labor con los animales/)).toBeInTheDocument();
    expect(screen.getByText('Aprobada')).toBeInTheDocument();
    expect(screen.getByText('Oculta')).toBeInTheDocument();

    // Only the approved review gets the action — the already-hidden one has none.
    expect(screen.getAllByRole('button', { name: 'Marcar como spam' })).toHaveLength(1);
  });

  it('marks a review as spam and refetches the list', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let marked = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/reviews/rev-1/mark-spam')) {
        marked = true;
        return { id: 'rev-1', status: 'hidden' };
      }
      if (url.includes('/reviews/org')) {
        return marked
          ? [
              {
                id: 'rev-1',
                organizationId: 'org-self',
                rating: 1,
                comment: 'Enlace sospechoso',
                isAnonymous: true,
                status: 'hidden',
                rejectionReason: 'spam',
                createdAt: '2026-09-29T00:00:00.000Z',
              },
            ]
          : [
              {
                id: 'rev-1',
                organizationId: 'org-self',
                rating: 1,
                comment: 'Enlace sospechoso',
                isAnonymous: true,
                status: 'approved',
                createdAt: '2026-09-29T00:00:00.000Z',
              },
            ];
      }
      return {};
    });
    renderShell({ route: '/organizacion/resenas', ...sessionWith([Role.Administrator]) });

    await screen.findByText(/Enlace sospechoso/);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como spam' }));

    await waitFor(() => {
      const post = calls.find((c) => c.url.includes('/reviews/rev-1/mark-spam'));
      expect(post).toBeDefined();
      expect(post?.init?.method).toBe('POST');
    });
    expect(await screen.findByText('Oculta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar como spam' })).not.toBeInTheDocument();
  });
});
