import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role, type AdoptionRequest } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * T-028a — org evaluation kanban at `/adopciones`. Deny-by-default gating (only
 * Owner/Administrator/Operator) and status transitions that POST to the API.
 */
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@refugio.org',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

const REQUEST: AdoptionRequest = {
  id: 'req-1',
  organizationId: 'org-1',
  animalId: 'an-1',
  animalSnapshot: { animalId: 'an-1', name: 'Firulais', species: 'dog' },
  applicantUserId: 'u2',
  applicant: { fullName: 'Adoptante Uno', email: 'a1@test.local' },
  message: 'Un mensaje suficientemente largo para la solicitud de adopción de prueba.',
  status: 'new',
  createdAt: '2026-07-24T15:00:00.000Z',
  updatedAt: '2026-07-24T15:00:00.000Z',
};

let post = vi.fn();

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      let body: unknown = {};
      if (url.includes('/adoptions') && url.includes('/transitions') && method === 'POST') {
        post(url, init);
        body = { ...REQUEST, status: 'in_review' };
      } else if (url.endsWith('/adoptions') && method === 'GET') {
        body = [REQUEST];
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => body,
      });
    }),
  );
}

beforeEach(() => {
  post = vi.fn();
  stubFetch();
});
afterEach(() => vi.unstubAllGlobals());

describe('AdoptionsKanbanPage', () => {
  it('denies the board to a user without an eval role (deny-by-default)', async () => {
    renderShell({ route: '/adopciones', ...sessionWith([]) });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });

  it('renders the request in its column and moves it on a transition click', async () => {
    renderShell({ route: '/adopciones', ...sessionWith([Role.Owner]) });

    // The request card shows up (in the "Nuevas" column).
    expect(await screen.findByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText('Adoptante Uno')).toBeInTheDocument();

    // Moving it to "En evaluación" POSTs a transition.
    fireEvent.click(screen.getByRole('button', { name: 'En evaluación' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toContain('/adoptions/req-1/transitions');
  });
});
