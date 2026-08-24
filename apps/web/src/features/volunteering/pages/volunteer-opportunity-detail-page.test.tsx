import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Role,
  ServiceHoursStatus,
  VolunteerEnrollmentStatus,
  VolunteerOpportunityStatus,
} from '@adoptafacil/contracts';
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

const PENDING_ENROLLMENT = {
  id: 'en-1',
  organizationId: 'org-1',
  opportunityId: 'op-1',
  volunteerUserId: 'vol-1',
  volunteerName: 'Juan Voluntario',
  volunteerEmail: 'juan@test.local',
  appliesToStudentService: false,
  status: VolunteerEnrollmentStatus.Pending,
  createdAt: '2026-08-02T00:00:00.000Z',
};

const ACCEPTED_ENROLLMENT = { ...PENDING_ENROLLMENT, status: VolunteerEnrollmentStatus.Accepted };

const PENDING_HOURS = {
  id: 'h-1',
  organizationId: 'org-1',
  enrollmentId: 'en-1',
  volunteerUserId: 'vol-1',
  date: '2026-09-05T00:00:00.000Z',
  hours: 3,
  description: 'Apoyo logístico',
  status: 'pending' as ServiceHoursStatus,
  createdAt: '2026-09-05T00:00:00.000Z',
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

describe('VolunteerOpportunityDetailPage (RF18/RF19)', () => {
  it('shows a pending enrollment and rejects it with a mandatory reason', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST') return { ...PENDING_ENROLLMENT, status: 'rejected' };
      if (url.includes('/volunteer-enrollments')) {
        return { items: [PENDING_ENROLLMENT], total: 1, limit: 100, offset: 0 };
      }
      if (url.includes('/volunteer-opportunities/')) return OPPORTUNITY;
      return {};
    });
    renderShell({ route: '/organizacion/voluntariado/op-1', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Juan Voluntario')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    fireEvent.change(screen.getByPlaceholderText('Motivo del rechazo'), {
      target: { value: 'Cupo lleno' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));

    await waitFor(() => {
      const decision = calls.find((c) => c.url.includes('/decision') && c.init?.method === 'POST');
      expect(decision).toBeDefined();
      const body = JSON.parse(String(decision?.init?.body));
      expect(body).toEqual({ decision: 'reject', reason: 'Cupo lleno' });
    });
    expect(await screen.findByText('Inscripción rechazada')).toBeInTheDocument();
  });

  it('accepts an enrollment, reviews its hours, approves them, and issues a certificate', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let accepted = false;
    let approved = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/decision') && init?.method === 'POST') {
        if (url.includes('/service-hours/')) {
          approved = true;
          return { ...PENDING_HOURS, status: 'approved' };
        }
        accepted = true;
        return ACCEPTED_ENROLLMENT;
      }
      if (url.includes('/volunteer-certificates/') && init?.method === 'POST') {
        return {
          id: 'cert-1',
          organizationId: 'org-1',
          enrollmentId: 'en-1',
          volunteerUserId: 'vol-1',
          volunteerName: 'Juan Voluntario',
          organizationName: 'Refugio Patitas',
          opportunityTitle: 'Jornada de esterilización',
          totalApprovedHours: 3,
          periodStart: OPPORTUNITY.startDate,
          periodEnd: OPPORTUNITY.endDate,
          appliesToStudentService: false,
          issuedByUserId: 'u1',
          issuedAt: '2026-09-10T00:00:00.000Z',
        };
      }
      if (url.includes('/service-hours?')) {
        return {
          items: approved ? [{ ...PENDING_HOURS, status: 'approved' }] : [PENDING_HOURS],
          total: 1,
          limit: 100,
          offset: 0,
        };
      }
      if (url.includes('/volunteer-enrollments')) {
        return {
          items: [accepted ? ACCEPTED_ENROLLMENT : PENDING_ENROLLMENT],
          total: 1,
          limit: 100,
          offset: 0,
        };
      }
      if (url.includes('/volunteer-opportunities/')) return OPPORTUNITY;
      return {};
    });
    renderShell({ route: '/organizacion/voluntariado/op-1', ...sessionWith([Role.Owner]) });

    await screen.findByText('Juan Voluntario');
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(await screen.findByText('Inscripción aceptada')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Ver horas' }));
    expect(await screen.findByText('Apoyo logístico')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(await screen.findByText('Horas aprobadas')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Emitir certificado' }));
    expect(await screen.findByText('Certificado emitido')).toBeInTheDocument();
    expect(await screen.findByText(/3 horas efectivas/)).toBeInTheDocument();
  });

  it('hides management actions for ReadOnlyAuditor (view-only)', async () => {
    stubFetch((url) => {
      if (url.includes('/volunteer-enrollments')) {
        return { items: [PENDING_ENROLLMENT], total: 1, limit: 100, offset: 0 };
      }
      if (url.includes('/volunteer-opportunities/')) return OPPORTUNITY;
      return {};
    });
    renderShell({
      route: '/organizacion/voluntariado/op-1',
      ...sessionWith([Role.ReadOnlyAuditor]),
    });

    await screen.findByText('Juan Voluntario');
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });
});
