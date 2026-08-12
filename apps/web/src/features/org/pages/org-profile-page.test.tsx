import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * `/organizacion` — S2-VISUAL-TABS: this page is the hub for ALL organization
 * profile content, now organized as 5 tabs (Datos institucionales · Ubicación
 * · Contacto · Imágenes y redes · Acerca de nosotros) instead of 6 stacked
 * cards (S2-REORG). "Información de contacto extendida" doesn't get its own
 * tab — it's a sub-section inside "Contacto" (same category: portal-facing
 * contact info). Everything still saves through ONE endpoint, `PUT
 * /org/profile`, now triggered from the header's "Guardar cambios" button
 * (moved out of the form itself so it sits next to "Ver portal público").
 */
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Dueña',
        email: 'duena@patitas.org',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

const BASE_ORG = {
  id: 'org-1',
  name: 'Refugio Patitas',
  slug: 'patitas-felices',
  formalizationState: 'en_proceso',
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
        blob: async () => new Blob(),
      });
    }),
  );
}

async function goToTab(name: string) {
  await userEvent.click(await screen.findByRole('tab', { name }));
}

beforeEach(() => {
  stubFetch(() => BASE_ORG);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrgProfilePage — hub central en tabs (S2-VISUAL-TABS)', () => {
  it('shows the 3-button action bar: Formalización (with state), Personalización, Ver portal público', async () => {
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    // Scoped to <main>: the sidebar nav ALSO has a "Personalización" link
    // (different route context) — the action bar's own link must be queried
    // separately from it.
    const main = within(screen.getByRole('main'));

    const formalizacion = await main.findByRole('link', { name: /Formalización/ });
    expect(formalizacion).toHaveAttribute('href', '/organizacion/formalizacion');
    expect(formalizacion).toHaveTextContent('En proceso');

    const personalizacion = main.getByRole('link', { name: /Personalización/ });
    expect(personalizacion).toHaveAttribute('href', '/organizacion/portal');

    const publicPortal = main.getByRole('link', { name: /Ver portal público/ });
    expect(publicPortal).toHaveAttribute('href', '/o/patitas-felices');
    expect(publicPortal).toHaveAttribute('target', '_blank');

    // Never duplicated (T-D05 had it inside the header banner too).
    expect(main.getAllByRole('link', { name: /Ver portal público/ })).toHaveLength(1);
  });

  it('hides "Ver portal público" when the org has no slug yet', async () => {
    stubFetch(() => ({ ...BASE_ORG, slug: undefined }));
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    expect(
      within(screen.getByRole('main')).queryByRole('link', { name: /Ver portal público/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the 5 tabs (S2-VISUAL-TABS) and switching tabs keeps a single shared form', async () => {
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });

    const tabNames = [
      'Datos institucionales',
      'Ubicación',
      'Contacto',
      'Imágenes y redes',
      'Acerca de nosotros',
    ];
    for (const name of tabNames) {
      expect(await screen.findByRole('tab', { name })).toBeInTheDocument();
    }

    // Default tab: "Datos institucionales".
    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.queryByLabelText('Quiénes somos')).not.toBeInTheDocument();

    // Typing, then switching tabs, must not lose what was written.
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Refugio Nuevo' } });
    await goToTab('Acerca de nosotros');
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Quiénes somos')).toBeInTheDocument();

    await goToTab('Datos institucionales');
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Refugio Nuevo');
  });

  it('has NO preview panel next to the form — single centered column', async () => {
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    expect(screen.queryByText(/Vista previa/i)).not.toBeInTheDocument();
  });

  it('has NO URL text fields for logo/cover — upload-only (S2-REORG §5)', async () => {
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    await goToTab('Imágenes y redes');

    expect(screen.queryByLabelText('URL del logo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Fotos de portada/)).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Subir logo')).toBeInTheDocument();
    expect(screen.getByLabelText('Subir portada')).toBeInTheDocument();
  });

  it('shows "Cambiar logo" + a preview once the org already has one', async () => {
    stubFetch(() => ({ ...BASE_ORG, logoUrl: 'https://cdn.test/logo.png' }));
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    await goToTab('Imágenes y redes');

    expect(await screen.findByLabelText('Cambiar logo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Subir logo')).not.toBeInTheDocument();
  });

  it('uploads a logo file end-to-end (reserve target → PUT bytes → fills logoUrl for save)', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/org/profile/uploads')) {
        return {
          key: 'public/org-1/abc-logo.png',
          url: 'http://localhost:3000/storage/upload?key=public%2Forg-1%2Fabc-logo.png',
        };
      }
      if (url.includes('/storage/upload')) return {};
      return BASE_ORG;
    });
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    await goToTab('Imágenes y redes');

    const file = new File(['bytes'], 'logo.png', { type: 'image/png' });
    const input = await screen.findByLabelText('Subir logo');
    await userEvent.upload(input, file);

    await screen.findByLabelText('Cambiar logo');
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    await waitFor(() => {
      const put = calls.find((c) => c.url.endsWith('/org/profile') && c.init?.method === 'PUT');
      expect(put).toBeDefined();
      const body = JSON.parse(String(put?.init?.body));
      expect(body.logoUrl).toBe(
        'http://localhost:3000/storage/public?key=public%2Forg-1%2Fabc-logo.png',
      );
    });
  });

  it('loads and saves "Acerca de nosotros" + "Información de contacto extendida" through the SAME PUT /org/profile the rest of the form uses', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'PUT') return BASE_ORG;
      return {
        ...BASE_ORG,
        aboutUs: 'Historia real de la fundación.',
        extendedContact: { hours: 'Lun-Vie 9am-5pm', additionalPhones: ['3001234567'] },
      };
    });
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });

    await goToTab('Acerca de nosotros');
    expect(await screen.findByLabelText('Quiénes somos')).toHaveValue(
      'Historia real de la fundación.',
    );

    await goToTab('Contacto');
    expect(await screen.findByLabelText('Horario de atención')).toHaveValue('Lun-Vie 9am-5pm');
    expect(screen.getByLabelText('Teléfonos adicionales')).toHaveValue('3001234567');
    fireEvent.change(screen.getByLabelText('Dirección completa'), {
      target: { value: 'Calle 45 #12-34, Bogotá' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    await waitFor(() => {
      const puts = calls.filter((c) => c.url.endsWith('/org/profile') && c.init?.method === 'PUT');
      expect(puts).toHaveLength(1); // ONE endpoint, not two.
      const body = JSON.parse(String(puts[0].init?.body));
      expect(body.aboutUs).toBe('Historia real de la fundación.');
      expect(body.extendedContact).toEqual({
        hours: 'Lun-Vie 9am-5pm',
        fullAddress: 'Calle 45 #12-34, Bogotá',
        additionalPhones: ['3001234567'],
      });
    });
  });

  describe('Dirección de tu portal público (antes "slug") — UX de errores/validación', () => {
    it('no muestra la palabra "Slug" — usa un label entendible, con vista previa del enlace en vivo', async () => {
      renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
      await screen.findByRole('heading', { name: 'Perfil de la organización' });

      expect(screen.queryByText(/^Slug/)).not.toBeInTheDocument();
      const field = await screen.findByLabelText('Dirección de tu portal público');
      expect(field).toHaveValue('patitas-felices');
      expect(
        screen.getByText(/Así se verá el enlace de tu organización:.*\/o\/patitas-felices/),
      ).toBeInTheDocument();

      fireEvent.change(field, { target: { value: 'nuevo-nombre' } });
      expect(
        screen.getByText(/Así se verá el enlace de tu organización:.*\/o\/nuevo-nombre/),
      ).toBeInTheDocument();
    });

    it('valida en VIVO (sin necesidad de guardar) y ofrece una auto-sugerencia corregida', async () => {
      renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
      const field = await screen.findByLabelText('Dirección de tu portal público');

      fireEvent.change(field, { target: { value: 'Fundación Huellas' } });
      expect(
        await screen.findByText(
          'Solo se permiten letras minúsculas, números y guiones — sin espacios ni tildes.',
        ),
      ).toBeInTheDocument();

      const suggestion = screen.getByRole('button', { name: 'Usar "fundacion-huellas"' });
      fireEvent.click(suggestion);
      expect(field).toHaveValue('fundacion-huellas');
      // El error desaparece de inmediato al usar la sugerencia — sin guardar.
      expect(
        screen.queryByText(
          'Solo se permiten letras minúsculas, números y guiones — sin espacios ni tildes.',
        ),
      ).not.toBeInTheDocument();
    });

    it('muestra el mensaje claro del backend (409) cuando el slug ya está en uso — nunca "Internal Server Error"', async () => {
      // El helper `stubFetch` de este archivo siempre resuelve `ok:true` — para
      // simular un 409 real hace falta su propio stub aquí (mismo shape que
      // `client.request` espera: status/ok/json).
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (init?.method === 'PUT' && url.endsWith('/org/profile')) {
            return Promise.resolve({
              ok: false,
              status: 409,
              statusText: 'Conflict',
              headers: { get: () => null },
              json: async () => ({ message: 'Este nombre de portal ya está en uso. Elige otro.' }),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => BASE_ORG,
          });
        }),
      );
      renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
      await screen.findByRole('heading', { name: 'Perfil de la organización' });

      fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

      expect(
        await screen.findByText('Este nombre de portal ya está en uso. Elige otro.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Internal Server Error/i)).not.toBeInTheDocument();
    });
  });

  describe('límites de longitud alineados con el backend (org.schemas.ts)', () => {
    it('topa Nombre/NIT/Razón social/Descripción/WhatsApp/Teléfono en el mismo límite que el backend', async () => {
      renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
      await screen.findByRole('heading', { name: 'Perfil de la organización' });

      expect(screen.getByLabelText('Nombre')).toHaveAttribute('maxLength', '200');
      expect(screen.getByLabelText('NIT')).toHaveAttribute('maxLength', '50');
      expect(screen.getByLabelText('Razón social')).toHaveAttribute('maxLength', '200');
      expect(screen.getByLabelText('Descripción corta')).toHaveAttribute('maxLength', '5000');

      await goToTab('Contacto');
      expect(screen.getByLabelText('WhatsApp')).toHaveAttribute('maxLength', '30');
      expect(screen.getByLabelText('Teléfono')).toHaveAttribute('maxLength', '30');
    });

    it('la Descripción corta muestra el contador visible (ya existía en OrgTextAreaField, solo faltaba activarlo)', async () => {
      renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
      const description = await screen.findByLabelText('Descripción corta');
      expect(screen.getByText('0/5000')).toBeInTheDocument();

      fireEvent.change(description, { target: { value: 'Refugio sin fines de lucro' } });
      expect(screen.getByText('26/5000')).toBeInTheDocument();
    });
  });

  it('the map field uses the fixed label/placeholder (S2-REORG §6)', async () => {
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    await goToTab('Contacto');

    expect(screen.queryByLabelText('Enlace a Google Maps')).not.toBeInTheDocument();
    const mapField = await screen.findByLabelText('Ubicación en el mapa');
    expect(mapField).toHaveAttribute(
      'placeholder',
      'Pega el enlace de Google Maps de tu ubicación',
    );
  });
});
