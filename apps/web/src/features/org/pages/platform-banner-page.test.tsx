import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * `/plataforma/banner` (S-15 — pedido del cliente: "el administrador pueda
 * cambiar las fotos del banner por fotos de animales o lo que quiera
 * subir"). Mismo flujo reserve→PUT bytes→URL pública que ya prueba
 * `org-profile-page.test.tsx` para el logo, adaptado al endpoint de
 * plataforma.
 */
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

const SETTINGS_WITH_TWO_PHOTOS = {
  showOrganizationType: 'formalized_only',
  heroBannerPhotos: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'],
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

describe('PlatformBannerPage (S-15)', () => {
  it('shows the currently-saved photos, one per slot, and placeholders for empty slots', async () => {
    stubFetch((url) => (url.endsWith('/platform/settings') ? SETTINGS_WITH_TWO_PHOTOS : {}));
    renderShell({ route: '/plataforma/banner', ...sessionWith([Role.PlatformAdmin]) });

    const previews = await screen.findAllByAltText(/Vista previa: foto/);
    expect(previews).toHaveLength(2);
    expect(previews[0]).toHaveAttribute('src', 'https://cdn.test/a.jpg');
    expect(previews[1]).toHaveAttribute('src', 'https://cdn.test/b.jpg');
  });

  it('uploads a photo into an empty slot end-to-end (reserve target → PUT bytes → preview), then saves', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/platform/settings') && init?.method !== 'PUT') {
        return SETTINGS_WITH_TWO_PHOTOS;
      }
      if (url.includes('/platform/settings/uploads')) {
        return {
          key: 'public/org-self/abc-banner.jpg',
          url: 'http://localhost:3000/storage/upload?key=public%2Forg-self%2Fabc-banner.jpg',
        };
      }
      if (url.includes('/storage/upload')) return {};
      if (init?.method === 'PUT') return SETTINGS_WITH_TWO_PHOTOS;
      return {};
    });
    renderShell({ route: '/plataforma/banner', ...sessionWith([Role.PlatformAdmin]) });

    await screen.findAllByAltText(/Vista previa: foto/);
    const file = new File(['bytes'], 'banner.jpg', { type: 'image/jpeg' });
    // Two empty slots (3 and 4) both say "Subir foto" — the first one is slot 3.
    const [input] = screen.getAllByLabelText('Subir foto');
    await userEvent.upload(input, file);

    await screen.findByAltText('Vista previa: foto 3 del banner');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      const put = calls.find(
        (c) => c.url.endsWith('/platform/settings') && c.init?.method === 'PUT',
      );
      expect(put).toBeDefined();
      const body = JSON.parse(String(put?.init?.body));
      expect(body.heroBannerPhotos).toEqual([
        'https://cdn.test/a.jpg',
        'https://cdn.test/b.jpg',
        'http://localhost:3000/storage/public?key=public%2Forg-self%2Fabc-banner.jpg',
      ]);
    });
    expect(await screen.findByText('Banner actualizado')).toBeInTheDocument();
  });

  it('removing a photo clears its slot and the save omits it', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/platform/settings') && init?.method !== 'PUT') {
        return SETTINGS_WITH_TWO_PHOTOS;
      }
      return SETTINGS_WITH_TWO_PHOTOS;
    });
    renderShell({ route: '/plataforma/banner', ...sessionWith([Role.PlatformAdmin]) });

    await screen.findAllByAltText(/Vista previa: foto/);
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      const put = calls.find(
        (c) => c.url.endsWith('/platform/settings') && c.init?.method === 'PUT',
      );
      expect(put).toBeDefined();
      const body = JSON.parse(String(put?.init?.body));
      expect(body.heroBannerPhotos).toEqual(['https://cdn.test/b.jpg']);
    });
  });

  it('denies a non-platform role (Owner)', async () => {
    stubFetch(() => ({}));
    renderShell({ route: '/plataforma/banner', ...sessionWith([Role.Owner]) });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });
});
