import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostType, Role, type Post } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * M11 (F-8) — `/comunidad`, feed cruzado. Cualquier usuario autenticado
 * (organización o Persona) puede publicar — sin `@Roles` en el backend.
 */
function sessionWith(accountType: 'organization' | 'person' = 'organization') {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Dueña',
        email: 'duena@patitas.org',
        roles: accountType === 'organization' ? [Role.Owner] : [],
        organizationId: 'org-1',
        accountType,
      },
    },
  };
}

function post(id: string, over: Partial<Post> = {}): Post {
  return {
    id,
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    authorUserId: 'u1',
    authorName: 'Dueña',
    type: PostType.General,
    body: 'Esta es una publicación de prueba en la comunidad.',
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

describe('CommunityFeedPage — feed cruzado (F-8)', () => {
  it('renders a card per post read from the wrapped `.items`', async () => {
    stubFetch(() => ({
      items: [
        post('p1'),
        post('p2', {
          authorName: 'Vecina',
          organizationId: undefined,
          organizationName: undefined,
        }),
      ],
      total: 2,
      limit: 50,
      offset: 0,
    }));
    renderShell({ route: '/comunidad', ...sessionWith() });

    expect(await screen.findAllByTestId('post-card')).toHaveLength(2);
  });

  it('shows a friendly empty state with a "Publicar" CTA', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    renderShell({ route: '/comunidad', ...sessionWith() });

    expect(await screen.findByText('Aún no hay publicaciones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar la primera' })).toBeInTheDocument();
  });

  it('a PERSONA can also publish (no @Roles on the backend)', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    renderShell({ route: '/comunidad', ...sessionWith('person') });

    await screen.findByRole('heading', { name: 'Comunidad' });
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument();
  });

  it('publishes with the REAL required fields and toasts success', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let created = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST' && url.includes('/community/posts')) {
        created = true;
        return { post: post('p1'), imageUploads: [] };
      }
      return { items: created ? [post('p1')] : [], total: created ? 1 : 0, limit: 50, offset: 0 };
    });
    renderShell({ route: '/comunidad', ...sessionWith() });

    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Publicación (10-2000 caracteres)'), {
      target: { value: 'Esta es una publicación de prueba con suficiente longitud.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(post).toBeDefined();
      const body = JSON.parse(String(post?.init?.body));
      expect(body).toMatchObject({
        type: PostType.General,
        body: 'Esta es una publicación de prueba con suficiente longitud.',
      });
    });
    expect(await screen.findByText('Publicación creada')).toBeInTheDocument();
  });

  it('rejects a body shorter than 10 characters before ever calling the API', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    renderShell({ route: '/comunidad', ...sessionWith() });

    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Publicación (10-2000 caracteres)'), {
      target: { value: 'corto' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));

    expect(await screen.findByText('Publicación muy corta')).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });
});
