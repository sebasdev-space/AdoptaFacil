import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role, VolunteerEnrollmentStatus } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'vol-1',
        name: 'Juan Voluntario',
        email: 'juan@test.local',
        roles,
        organizationId: 'org-self',
        accountType: roles.length ? ('organization' as const) : ('person' as const),
      },
    },
  };
}

const PUBLIC_OPPORTUNITY = {
  id: 'op-1',
  organizationId: 'org-1',
  organizationName: 'Refugio Patitas',
  title: 'Jornada de esterilización',
  category: 'sterilizations',
  startDate: '2026-09-01T00:00:00.000Z',
  endDate: '2026-09-30T00:00:00.000Z',
  location: 'Refugio Patitas',
  appliesToStudentService: false,
};

const ACCEPTED_MINE = {
  id: 'en-1',
  organizationId: 'org-1',
  organizationName: 'Refugio Patitas',
  opportunityId: 'op-1',
  opportunityTitle: 'Jornada de esterilización',
  volunteerUserId: 'vol-1',
  volunteerName: '',
  volunteerEmail: 'juan@test.local',
  appliesToStudentService: false,
  status: VolunteerEnrollmentStatus.Accepted,
  createdAt: '2026-08-02T00:00:00.000Z',
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

describe('MyVolunteeringPage (RF18/RF19)', () => {
  it('lists public opportunities, enrolls, and shows the enrollment as pending', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let enrolled = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST' && url.includes('/volunteer-enrollments')) {
        enrolled = true;
        return { ...ACCEPTED_MINE, status: 'pending' };
      }
      if (url.includes('/public/volunteer-opportunities')) {
        return { items: [PUBLIC_OPPORTUNITY], total: 1, limit: 50, offset: 0 };
      }
      if (url.includes('/volunteer-enrollments/mine')) {
        return enrolled ? [{ ...ACCEPTED_MINE, status: 'pending' }] : [];
      }
      if (url.includes('/service-hours/mine')) return [];
      if (url.includes('/volunteer-certificates/mine')) return [];
      return {};
    });
    renderShell({ route: '/voluntariado', ...sessionWith([]) });

    expect(
      await screen.findByText(/Jornada de esterilización · Refugio Patitas/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }));

    expect(await screen.findByText('Inscripción enviada')).toBeInTheDocument();
    await waitFor(() => {
      const post = calls.find(
        (c) => c.init?.method === 'POST' && c.url.includes('/volunteer-enrollments'),
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toEqual({ opportunityId: 'op-1' });
    });
  });

  it('logs hours against an accepted enrollment', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST' && url.includes('/service-hours')) {
        return { id: 'h-1', status: 'pending' };
      }
      if (url.includes('/public/volunteer-opportunities')) {
        return { items: [], total: 0, limit: 50, offset: 0 };
      }
      if (url.includes('/volunteer-enrollments/mine')) return [ACCEPTED_MINE];
      if (url.includes('/service-hours/mine')) return [];
      if (url.includes('/volunteer-certificates/mine')) return [];
      return {};
    });
    renderShell({ route: '/voluntariado', ...sessionWith([]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Registrar horas' }));
    fireEvent.change(screen.getByLabelText('Fecha de la sesión'), {
      target: { value: '2026-09-05' },
    });
    fireEvent.change(screen.getByLabelText('Horas trabajadas'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Descripción de la sesión'), {
      target: { value: 'Apoyo logístico' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas' }));

    expect(await screen.findByText('Horas registradas')).toBeInTheDocument();
    const post = calls.find((c) => c.init?.method === 'POST' && c.url.includes('/service-hours'));
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.init?.body));
    expect(body.enrollmentId).toBe('en-1');
    expect(body.hours).toBe(3);
  });

  it('shows a certificate and offers to download it', async () => {
    stubFetch((url) => {
      if (url.includes('/public/volunteer-opportunities')) {
        return { items: [], total: 0, limit: 50, offset: 0 };
      }
      if (url.includes('/volunteer-enrollments/mine')) return [];
      if (url.includes('/service-hours/mine')) return [];
      if (url.includes('/volunteer-certificates/mine')) {
        return [
          {
            id: 'cert-1',
            organizationId: 'org-1',
            enrollmentId: 'en-1',
            volunteerUserId: 'vol-1',
            volunteerName: 'Juan Voluntario',
            organizationName: 'Refugio Patitas',
            opportunityTitle: 'Jornada de esterilización',
            totalApprovedHours: 12,
            periodStart: '2026-09-01T00:00:00.000Z',
            periodEnd: '2026-09-30T00:00:00.000Z',
            appliesToStudentService: false,
            issuedByUserId: 'owner-1',
            issuedAt: '2026-10-01T00:00:00.000Z',
          },
        ];
      }
      return {};
    });
    renderShell({ route: '/voluntariado', ...sessionWith([]) });

    expect(
      await screen.findByText('Jornada de esterilización · Refugio Patitas'),
    ).toBeInTheDocument();
    expect(screen.getByText(/12 horas efectivas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument();
  });
});
