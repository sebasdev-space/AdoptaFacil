import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostType, Role, type Post } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * M11 (F-8) — `/plataforma/comunidad`, moderación básica. Solo
 * PlatformAdmin/PlatformSuperAdmin (calcado del @Roles real de
 * `CommunityModerationController`).
 */
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'reviewer-1',
        name: 'Revisora',
        email: 'revisora@adoptafacil.com',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

function post(over: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    authorUserId: 'author-1',
    authorName: 'Autora',
    type: PostType.General,
    body: 'Publicación a revisar.',
    images: [],
    commentCount: 0,
    likeCount: 0,
    status: 'published' as Post['status'],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CommunityModerationPage — moderación básica (F-8)', () => {
  it('denies access to a non-platform role (RBAC, deny-by-default)', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    renderShell({ route: '/plataforma/comunidad', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });

  it('lists posts for a PlatformAdmin', async () => {
    stubFetch(() => ({ items: [post()], total: 1, limit: 50, offset: 0 }));
    renderShell({ route: '/plataforma/comunidad', ...sessionWith([Role.PlatformAdmin]) });

    expect(await screen.findByText('Publicación a revisar.')).toBeInTheDocument();
  });

  it('removing requires a reason (client-side, before calling the API)', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      return { items: [post()], total: 1, limit: 50, offset: 0 };
    });
    renderShell({ route: '/plataforma/comunidad', ...sessionWith([Role.PlatformSuperAdmin]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Retirar' }));
    expect(await screen.findByText('Motivo requerido')).toBeInTheDocument();
    expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(false);
  });

  it('removes a post with a reason, and toasts success', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let removed = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'PATCH') {
        removed = true;
        return post({ status: 'removed' as Post['status'], moderationReason: 'Spam' });
      }
      return {
        items: [post(removed ? { status: 'removed' as Post['status'] } : {})],
        total: 1,
        limit: 50,
        offset: 0,
      };
    });
    renderShell({ route: '/plataforma/comunidad', ...sessionWith([Role.PlatformSuperAdmin]) });

    await screen.findByText('Publicación a revisar.');
    fireEvent.change(screen.getByPlaceholderText('Motivo (requerido para retirar)'), {
      target: { value: 'Spam' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch?.init?.body));
      expect(body).toMatchObject({ decision: 'remove', reason: 'Spam' });
    });
    expect(await screen.findByText('Decisión registrada')).toBeInTheDocument();
  });
});
