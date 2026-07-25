import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role, type AdoptionFollowUpMilestone } from '@adoptafacil/contracts';
import { AppProviders } from '../../../shell/app-providers';
import { AdoptionFollowUpPanel } from './adoption-followup-panel';

/**
 * T-028c — the follow-up panel (org-facing) on a signed contract. Verifies that
 * milestones render with their status (incl. an overdue one) and that scheduling
 * is offered only to a user who may manage (deny-by-default).
 */
function providers(roles: Role[], children: React.ReactNode) {
  return (
    <AppProviders
      session={{
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u1',
          name: 'Owner',
          email: 'owner@refugio.org',
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

const OVERDUE: AdoptionFollowUpMilestone = {
  id: 'm1',
  organizationId: 'org-1',
  contractId: 'c1',
  requestId: 'r1',
  adopterUserId: 'u2',
  adopterName: 'Adoptante',
  adopterEmail: 'a@test.local',
  title: 'Visita a los 30 días',
  questionnaire: [],
  dueAt: '2026-07-01T12:00:00.000Z',
  status: 'overdue',
  createdAt: '2026-06-01T12:00:00.000Z',
  updatedAt: '2026-07-02T12:00:00.000Z',
  evidence: [],
};

function stubFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: '',
        headers: { get: () => null },
        json: async () => body,
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('AdoptionFollowUpPanel', () => {
  it('lists milestones with status and offers scheduling to a manager', async () => {
    stubFetch([OVERDUE]);
    render(providers([Role.Owner], <AdoptionFollowUpPanel contractId="c1" canManage />));
    expect(await screen.findByText('Visita a los 30 días')).toBeInTheDocument();
    expect(screen.getByText('Vencido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Programar hito' })).toBeInTheDocument();
    // An overdue milestone can still be closed by the org.
    expect(screen.getByRole('button', { name: 'Completar' })).toBeInTheDocument();
  });

  it('does not offer scheduling to a non-manager (deny-by-default)', async () => {
    stubFetch([]);
    render(providers([], <AdoptionFollowUpPanel contractId="c1" canManage={false} />));
    expect(await screen.findByText('Sin hitos programados.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Programar hito' })).not.toBeInTheDocument();
  });
});
