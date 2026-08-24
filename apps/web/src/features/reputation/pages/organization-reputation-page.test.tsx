import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

function sessionWith(roles: Role[] | null) {
  if (roles === null) {
    return { session: { initialStatus: 'unauthenticated' as const } };
  }
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'vis-1',
        name: 'Visitante',
        email: 'visitante@test.local',
        roles,
        organizationId: 'org-self',
        accountType: roles.length ? ('organization' as const) : ('person' as const),
      },
    },
  };
}

const SUMMARY = { organizationId: 'org-1', averageRating: 4.5, approvedReviewsCount: 2 };
const REVIEWS = {
  items: [
    {
      id: 'r1',
      rating: 5,
      comment: 'Excelente',
      authorName: 'Ana',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    { id: 'r2', rating: 4, comment: 'Muy buena', createdAt: '2026-08-02T00:00:00.000Z' },
  ],
  total: 2,
  limit: 50,
  offset: 0,
};

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

describe('OrganizationReputationPage (RF23)', () => {
  it('shows the public summary and approved reviews without a session', async () => {
    stubFetch((url) => {
      if (url.includes('reputation-summary')) return SUMMARY;
      if (url.includes('/reviews')) return REVIEWS;
      return {};
    });
    renderShell({ route: '/organizaciones/refugio-x/resenas', ...sessionWith(null) });

    expect(await screen.findByText(/4.50/)).toBeInTheDocument();
    expect(await screen.findByText('Excelente')).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    // The second review has no authorName (anonymous) — shows the fallback.
    expect(screen.getByText(/Anónimo/)).toBeInTheDocument();
  });

  it('lets an authenticated visitor without a prior review submit one', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let created = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST' && url.includes('/reviews')) {
        created = true;
        return { id: 'new-1', organizationId: 'org-1', rating: 5, status: 'pending' };
      }
      if (url.includes('reputation-summary')) return SUMMARY;
      if (url.includes('/organizations/') && url.includes('/reviews')) return REVIEWS;
      if (url.includes('/reviews/mine')) return created ? [{ id: 'new-1', status: 'pending' }] : [];
      return {};
    });
    renderShell({ route: '/organizaciones/refugio-x/resenas', ...sessionWith([]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar reseña' }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST' && c.url.includes('/reviews'));
      expect(post).toBeDefined();
      const body = JSON.parse(String(post?.init?.body));
      expect(body).toEqual({ organizationId: 'org-1', rating: 5, isAnonymous: false });
    });
    expect(await screen.findByText('Reseña enviada')).toBeInTheDocument();
  });

  it('shows the status of an existing review instead of the form', async () => {
    stubFetch((url) => {
      if (url.includes('reputation-summary')) return SUMMARY;
      if (url.includes('/organizations/') && url.includes('/reviews')) return REVIEWS;
      if (url.includes('/reviews/mine')) {
        return [
          {
            id: 'mine-1',
            organizationId: 'org-1',
            organizationName: 'Refugio X',
            authorUserId: 'vis-1',
            rating: 3,
            isAnonymous: false,
            status: 'pending',
            createdAt: '2026-08-01T00:00:00.000Z',
          },
        ];
      }
      return {};
    });
    renderShell({ route: '/organizaciones/refugio-x/resenas', ...sessionWith([]) });

    expect(await screen.findByText('Pendiente de revisión')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar reseña' })).not.toBeInTheDocument();
  });
});
