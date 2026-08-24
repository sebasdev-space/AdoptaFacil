import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role, VolunteerOpportunityStatus } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Dueña',
        email: 'duena@refugio.test',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

const OPPORTUNITY = {
  id: 'op-1',
  organizationId: 'org-1',
  title: 'Jornada de esterilización',
  category: 'sterilizations',
  startDate: '2026-09-01T00:00:00.000Z',
  endDate: '2026-09-30T00:00:00.000Z',
  location: 'Refugio Patitas',
  appliesToStudentService: false,
  status: VolunteerOpportunityStatus.Active,
  createdAt: '2026-08-01T00:00:00.000Z',
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

describe('VolunteerOpportunitiesPage (RF18)', () => {
  it('shows opportunities and the "Publicar oportunidad" action for Owner', async () => {
    stubFetch((url) => {
      if (url.includes('/volunteer-opportunities')) {
        return { items: [OPPORTUNITY], total: 1, limit: 50, offset: 0 };
      }
      return {};
    });
    renderShell({ route: '/organizacion/voluntariado', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Jornada de esterilización')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar oportunidad' })).toBeInTheDocument();
  });

  it('hides "Publicar oportunidad" for ReadOnlyAuditor (view-only)', async () => {
    stubFetch(() => ({ items: [OPPORTUNITY], total: 1, limit: 50, offset: 0 }));
    renderShell({ route: '/organizacion/voluntariado', ...sessionWith([Role.ReadOnlyAuditor]) });

    await screen.findByText('Jornada de esterilización');
    expect(screen.queryByRole('button', { name: 'Publicar oportunidad' })).not.toBeInTheDocument();
  });

  it('publishes a new opportunity with the real required fields and toasts success', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST') return OPPORTUNITY;
      if (url.includes('/volunteer-opportunities')) {
        return { items: [], total: 0, limit: 50, offset: 0 };
      }
      return {};
    });
    renderShell({ route: '/organizacion/voluntariado', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Publicar oportunidad' }));
    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Jornada de esterilización' },
    });
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'sterilizations' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de inicio'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.change(screen.getByLabelText('Fecha de fin'), { target: { value: '2026-09-30' } });
    fireEvent.change(screen.getByLabelText('Ubicación'), { target: { value: 'Refugio Patitas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar oportunidad' }));

    expect(await screen.findByText('Oportunidad publicada')).toBeInTheDocument();
    const post = calls.find((c) => c.init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.init?.body));
    expect(body.title).toBe('Jornada de esterilización');
    expect(body.appliesToStudentService).toBe(false);
  });

  it('a person without an org role cannot publish (403, via RequireRoles)', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    renderShell({ route: '/organizacion/voluntariado', ...sessionWith([]) });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });
});
