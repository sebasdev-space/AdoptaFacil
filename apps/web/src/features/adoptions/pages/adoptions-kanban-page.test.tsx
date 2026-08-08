import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
        const targetStatus = JSON.parse(String(init?.body ?? '{}')).targetStatus ?? 'in_review';
        body = { ...REQUEST, status: targetStatus };
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

  describe('F-MODAL-SOLICITANTE: applicant detail modal', () => {
    it('opens from the card and shows the REAL applicant/animal data the contract already exposes', async () => {
      renderShell({ route: '/adopciones', ...sessionWith([Role.Owner]) });

      const card = (await screen.findByText('Firulais')).closest(
        '[data-testid="adoption-card"]',
      ) as HTMLElement;
      fireEvent.click(within(card).getByTestId('open-applicant-detail'));

      const modal = await screen.findByTestId('applicant-detail-modal');
      expect(within(modal).getByTestId('applicant-name')).toHaveTextContent('Adoptante Uno');
      expect(within(modal).getByTestId('applicant-email')).toHaveTextContent('a1@test.local');
      expect(within(modal).getByTestId('applicant-message')).toHaveTextContent(REQUEST.message);
      expect(within(modal).getByText('Solicitud para adoptar a Firulais')).toBeInTheDocument();
      // Same status wording as the kanban column (single source: ADOPTION_STATUS_LABELS).
      expect(within(modal).getByText('Nuevas')).toBeInTheDocument();
    });

    it('never fabricates a phone number when the applicant did not provide one', async () => {
      renderShell({ route: '/adopciones', ...sessionWith([Role.Owner]) });

      const card = (await screen.findByText('Firulais')).closest(
        '[data-testid="adoption-card"]',
      ) as HTMLElement;
      fireEvent.click(within(card).getByTestId('open-applicant-detail'));

      const modal = await screen.findByTestId('applicant-detail-modal');
      expect(within(modal).queryByTestId('applicant-phone')).not.toBeInTheDocument();
    });

    it('advancing from the modal uses the SAME transition action as the card, and stays open reflecting the new status', async () => {
      renderShell({ route: '/adopciones', ...sessionWith([Role.Owner]) });

      const card = (await screen.findByText('Firulais')).closest(
        '[data-testid="adoption-card"]',
      ) as HTMLElement;
      fireEvent.click(within(card).getByTestId('open-applicant-detail'));

      const modal = await screen.findByTestId('applicant-detail-modal');
      fireEvent.click(within(modal).getByRole('button', { name: 'En evaluación' }));

      await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      expect(post.mock.calls[0][0]).toContain('/adoptions/req-1/transitions');
      // Same modal, now showing the request's new status — no need to reopen.
      await waitFor(() => expect(within(modal).getByText('En evaluación')).toBeInTheDocument());
      expect(within(modal).getByRole('button', { name: 'Aprobada' })).toBeInTheDocument();
      expect(within(modal).getByRole('button', { name: 'Rechazada' })).toBeInTheDocument();
    });

    it('closing the modal does not affect the card underneath (detail-only, no rework)', async () => {
      renderShell({ route: '/adopciones', ...sessionWith([Role.Owner]) });

      const card = (await screen.findByText('Firulais')).closest(
        '[data-testid="adoption-card"]',
      ) as HTMLElement;
      fireEvent.click(within(card).getByTestId('open-applicant-detail'));
      await screen.findByTestId('applicant-detail-modal');

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
      await waitFor(() =>
        expect(screen.queryByTestId('applicant-detail-modal')).not.toBeInTheDocument(),
      );
      // The card's own direct-action button is still there, untouched.
      expect(within(card).getByRole('button', { name: 'En evaluación' })).toBeInTheDocument();
    });
  });
});
