import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@plataforma.test',
        roles,
        organizationId: 'org-self',
        accountType: 'organization' as const,
      },
    },
  };
}

const PENDING_ITEM = {
  id: 'rev-1',
  organizationId: 'org-1',
  organizationName: 'Refugio Patitas',
  authorUserId: 'user-1',
  authorName: 'Juan Pérez',
  rating: 5,
  comment: 'Excelente organización',
  isAnonymous: false,
  status: 'pending',
  createdAt: '2026-08-01T00:00:00.000Z',
};

const APPROVED_ITEM = { ...PENDING_ITEM, id: 'rev-2', status: 'approved' };

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

describe('PlatformReviewsReviewPage (RF23)', () => {
  it('rejects a pending review with a mandatory reason', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST') return { ...PENDING_ITEM, status: 'rejected' };
      if (url.includes('/platform/reviews/queue')) return [PENDING_ITEM];
      return {};
    });
    renderShell({ route: '/plataforma/resenas', ...sessionWith([Role.PlatformAdmin]) });

    expect(await screen.findByText('Juan Pérez', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));

    // No reason yet — the POST must not have fired.
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false);

    fireEvent.change(screen.getByLabelText('Motivo (requerido para rechazar/ocultar)'), {
      target: { value: 'Contenido ofensivo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));

    await waitFor(() => {
      const post = calls.find((c) => c.url.includes('/decision') && c.init?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toEqual({
        decision: 'reject',
        reason: 'Contenido ofensivo',
      });
    });
    expect(await screen.findByText('Decisión registrada')).toBeInTheDocument();
  });

  it('hides an approved review with a mandatory reason', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/hide') && init?.method === 'POST') {
        return { ...APPROVED_ITEM, status: 'hidden' };
      }
      if (url.includes('/platform/reviews/queue')) return [APPROVED_ITEM];
      return {};
    });
    renderShell({ route: '/plataforma/resenas', ...sessionWith([Role.PlatformSuperAdmin]) });

    await screen.findByText('Juan Pérez', { exact: false });
    fireEvent.change(screen.getByLabelText('Motivo (requerido para rechazar/ocultar)'), {
      target: { value: 'Reportada por contenido falso' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar (reporte)' }));

    await waitFor(() => {
      const post = calls.find((c) => c.url.includes('/hide') && c.init?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toEqual({
        reason: 'Reportada por contenido falso',
      });
    });
    expect(await screen.findByText('Reseña ocultada')).toBeInTheDocument();
  });

  it('hides moderation actions for a non-platform role', async () => {
    renderShell({ route: '/plataforma/resenas', ...sessionWith([Role.Owner]) });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });
});
