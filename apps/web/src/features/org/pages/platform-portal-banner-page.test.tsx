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

const PHOTO = (id: string, position: number, over: Record<string, unknown> = {}) => ({
  id,
  position,
  storageKey: `public/o/${id}-a.jpg`,
  imageUrl: `http://x/${id}.jpg`,
  altText: `Alt ${id}`,
  isActive: true,
  createdAt: '2026-09-30T00:00:00.000Z',
  ...over,
});

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

describe('PlatformPortalBannerPage', () => {
  it('denies access without a platform role', async () => {
    stubFetch(() => []);
    renderShell({ route: '/plataforma/banner', ...sessionWith([Role.Owner]) });
    // RequireRoles never mounts the page for a non-platform role.
    await waitFor(() => expect(screen.queryByText('Banner del portal')).not.toBeInTheDocument());
  });

  it('lists photos, reorders and toggles active', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/platform/portal-banner') && !init?.method) {
        return [PHOTO('a', 0), PHOTO('b', 1)];
      }
      return {};
    });
    renderShell({ route: '/plataforma/banner', ...sessionWith([Role.PlatformAdmin]) });

    expect(await screen.findByAltText('Alt a')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bajar Alt a' }));
    await waitFor(() => {
      const put = calls.find((c) => c.url.endsWith('/order') && c.init?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse(String(put?.init?.body))).toEqual({ ids: ['b', 'a'] });
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]);
    await waitFor(() => {
      const patch = calls.find(
        (c) => c.url.endsWith('/platform/portal-banner/a') && c.init?.method === 'PATCH',
      );
      expect(JSON.parse(String(patch?.init?.body))).toEqual({ isActive: false });
    });
  });

  it('blocks upload without alt text and does not call the API', async () => {
    const calls: string[] = [];
    stubFetch((url) => {
      calls.push(url);
      return [];
    });
    renderShell({ route: '/plataforma/banner', ...sessionWith([Role.PlatformSuperAdmin]) });

    const input = await screen.findByLabelText(/Nueva foto/);
    const file = new File([new Uint8Array(10)], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Subir foto' }));

    expect(await screen.findByText('Texto alternativo requerido')).toBeInTheDocument();
    expect(calls.some((u) => u.includes('upload-target'))).toBe(false);
  });

  it('disables upload when 4 photos already exist', async () => {
    stubFetch(() => [PHOTO('a', 0), PHOTO('b', 1), PHOTO('c', 2), PHOTO('d', 3)]);
    renderShell({ route: '/plataforma/banner', ...sessionWith([Role.PlatformAdmin]) });
    await screen.findByAltText('Alt d');
    expect(screen.getByLabelText(/Nueva foto/)).toBeDisabled();
  });
});
