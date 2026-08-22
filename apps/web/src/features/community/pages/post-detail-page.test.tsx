import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostType, Role, type Post } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * M11 (F-8) — `/comunidad/:id`, detalle: comentar, dar like, y (solo la
 * autora) editar/borrar. `likedByMe` no existe en el contrato — el botón de
 * like solo refleja lo alternado EN ESTA SESIÓN, nunca un historial fingido.
 */
function sessionAs(userId: string) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: userId,
        name: 'Usuaria',
        email: 'usuaria@test.local',
        roles: [Role.Owner],
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
    body: 'Cuerpo de la publicación de prueba.',
    images: [],
    commentCount: 0,
    likeCount: 3,
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

describe('PostDetailPage', () => {
  it('hides edit/delete from a viewer who is NOT the author', async () => {
    stubFetch((url) => {
      if (url.includes('/comments')) return { items: [], total: 0, limit: 50, offset: 0 };
      return post();
    });
    renderShell({ route: '/comunidad/p1', ...sessionAs('viewer-1') });

    await screen.findByTestId('post-detail');
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('shows edit/delete to the AUTHOR', async () => {
    stubFetch((url) => {
      if (url.includes('/comments')) return { items: [], total: 0, limit: 50, offset: 0 };
      return post();
    });
    renderShell({ route: '/comunidad/p1', ...sessionAs('author-1') });

    await screen.findByTestId('post-detail');
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  it('toggling like updates the button label and count from the REAL response', async () => {
    stubFetch((url, init) => {
      if (url.includes('/comments')) return { items: [], total: 0, limit: 50, offset: 0 };
      if (init?.method === 'POST' && url.includes('/like')) {
        return { liked: true, likeCount: 4 };
      }
      return post();
    });
    renderShell({ route: '/comunidad/p1', ...sessionAs('viewer-1') });

    await screen.findByTestId('post-detail');
    expect(screen.getByText('3 me gusta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Me gusta' }));

    await waitFor(() => {
      expect(screen.getByText('4 me gusta')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ya te gusta' })).toBeInTheDocument();
    });
  });

  it('adds a comment and reflects it in the list + count', async () => {
    let commented = false;
    stubFetch((url, init) => {
      if (init?.method === 'POST' && url.includes('/comments')) {
        commented = true;
        return {
          id: 'c1',
          postId: 'p1',
          authorUserId: 'viewer-1',
          authorName: 'Usuaria',
          body: 'Bien!',
          createdAt: '2026-08-02T00:00:00.000Z',
        };
      }
      if (url.includes('/comments')) {
        return {
          items: commented
            ? [
                {
                  id: 'c1',
                  postId: 'p1',
                  authorUserId: 'viewer-1',
                  authorName: 'Usuaria',
                  body: 'Bien!',
                  createdAt: '2026-08-02T00:00:00.000Z',
                },
              ]
            : [],
          total: commented ? 1 : 0,
          limit: 50,
          offset: 0,
        };
      }
      return post();
    });
    renderShell({ route: '/comunidad/p1', ...sessionAs('viewer-1') });

    await screen.findByTestId('post-detail');
    fireEvent.change(screen.getByLabelText('Comentario'), { target: { value: 'Bien!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comentar' }));

    expect(await screen.findByText('Bien!')).toBeInTheDocument();
    expect(await screen.findByText('Comentario agregado')).toBeInTheDocument();
  });
});
