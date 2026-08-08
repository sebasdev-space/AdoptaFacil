import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * `/organizacion` — S2-05: single-screen redesign over a top bar (breadcrumb,
 * REAL completeness meter, Formalización/Personalización/Ver portal público,
 * Guardar cambios) + 5 tabs (Datos institucionales/Ubicación/Contacto/
 * Imágenes y redes/Acerca de nosotros), replacing S2-REORG's 6-card layout.
 * Every field/id and the single `PUT /org/profile` payload are UNCHANGED —
 * only regrouped ("Contacto" now also holds what used to be "Información de
 * contacto extendida").
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

function switchTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }));
}

beforeEach(() => {
  stubFetch(() => BASE_ORG);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrgProfilePage — redesign de una sola pantalla (S2-05)', () => {
  it('shows the breadcrumb, the new title, and the top-bar actions for an editor', async () => {
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    expect(screen.getByText(/Configuración/)).toBeInTheDocument();

    const main = within(screen.getByRole('main'));
    const formalizacion = await main.findByRole('link', { name: /Formalización/ });
    expect(formalizacion).toHaveAttribute('href', '/organizacion/formalizacion');
    expect(formalizacion).toHaveTextContent('En proceso');

    const personalizacion = main.getByRole('link', { name: /Personalización/ });
    expect(personalizacion).toHaveAttribute('href', '/organizacion/portal');

    const publicPortal = main.getByRole('link', { name: /Ver portal público/ });
    expect(publicPortal).toHaveAttribute('href', '/o/patitas-felices');
    expect(publicPortal).toHaveAttribute('target', '_blank');

    expect(main.getByRole('button', { name: /Guardar cambios/ })).toBeInTheDocument();
    // Never duplicated (no bottom sticky button anymore — ONE save action).
    expect(main.getAllByRole('button', { name: /Guardar cambios/ })).toHaveLength(1);
  });

  it('hides "Ver portal público" when the org has no slug yet', async () => {
    stubFetch(() => ({ ...BASE_ORG, slug: undefined }));
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    expect(
      within(screen.getByRole('main')).queryByRole('link', { name: /Ver portal público/ }),
    ).not.toBeInTheDocument();
  });

  it('shows a REAL completeness percent computed from the loaded org, not a hardcoded number', async () => {
    // BASE_ORG only fills "Nombre" + "Slug del portal" → 2 of 9 tracked fields ≈ 22%.
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    expect(await screen.findByText('22%')).toBeInTheDocument();
    expect(screen.getByText('Perfil incompleto')).toBeInTheDocument();
  });

  it('renders all 5 tabs from the redesign, each exactly once', async () => {
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });

    const tabs = [
      'Datos institucionales',
      'Ubicación',
      'Contacto',
      'Imágenes y redes',
      'Acerca de nosotros',
    ];
    for (const name of tabs) {
      expect(screen.getAllByRole('tab', { name })).toHaveLength(1);
    }
    // Default tab shows its fields; the others are not mounted until selected.
    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ciudad / Municipio')).not.toBeInTheDocument();
  });

  it('regression: "Información de contacto extendida" fields now live inside the "Contacto" tab', async () => {
    stubFetch(() => ({
      ...BASE_ORG,
      extendedContact: { hours: 'Lun-Vie 9am-5pm', additionalPhones: ['3001234567'] },
    }));
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });

    switchTab('Contacto');
    expect(await screen.findByLabelText('Horario de atención')).toHaveValue('Lun-Vie 9am-5pm');
    expect(screen.getByLabelText('Teléfonos adicionales')).toHaveValue('3001234567');
    expect(screen.queryByLabelText('Enlace a Google Maps')).not.toBeInTheDocument();
    const mapField = screen.getByLabelText('Ubicación en el mapa');
    expect(mapField).toHaveAttribute(
      'placeholder',
      'Pega el enlace de Google Maps de tu ubicación',
    );
  });

  it('has NO URL text fields for logo/cover — upload-only (S2-REORG §5, still true post-redesign)', async () => {
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    switchTab('Imágenes y redes');

    expect(screen.queryByLabelText('URL del logo')).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Subir logo')).toBeInTheDocument();
    expect(screen.getByLabelText('Subir portada')).toBeInTheDocument();
  });

  it('uploads a logo, updates the live preview, and saves via the TOP-BAR Guardar button', async () => {
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
    switchTab('Imágenes y redes');

    const file = new File(['bytes'], 'logo.png', { type: 'image/png' });
    const input = await screen.findByLabelText('Subir logo');
    await userEvent.upload(input, file);

    await screen.findByLabelText('Cambiar logo');
    // Live preview reflects the uploaded logo immediately (draft, unsaved).
    expect(screen.getByAltText(/Logo de/)).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('main')).getByRole('button', { name: /Guardar cambios/ }),
    );

    await waitFor(() => {
      const put = calls.find((c) => c.url.endsWith('/org/profile') && c.init?.method === 'PUT');
      expect(put).toBeDefined();
      const body = JSON.parse(String(put?.init?.body));
      expect(body.logoUrl).toBe(
        'http://localhost:3000/storage/public?key=public%2Forg-1%2Fabc-logo.png',
      );
    });
  });

  it('loads and saves fields across tabs through the SAME single PUT /org/profile', async () => {
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

    switchTab('Contacto');
    const address = await screen.findByLabelText('Dirección completa');
    fireEvent.change(address, { target: { value: 'Calle 45 #12-34, Bogotá' } });

    switchTab('Acerca de nosotros');
    expect(await screen.findByLabelText('Quiénes somos')).toHaveValue(
      'Historia real de la fundación.',
    );

    fireEvent.click(
      within(screen.getByRole('main')).getByRole('button', { name: /Guardar cambios/ }),
    );

    await waitFor(() => {
      const puts = calls.filter((c) => c.url.endsWith('/org/profile') && c.init?.method === 'PUT');
      expect(puts).toHaveLength(1); // ONE endpoint, not two — switching tabs never split the save.
      const body = JSON.parse(String(puts[0].init?.body));
      expect(body.aboutUs).toBe('Historia real de la fundación.');
      expect(body.extendedContact).toEqual({
        hours: 'Lun-Vie 9am-5pm',
        fullAddress: 'Calle 45 #12-34, Bogotá',
        additionalPhones: ['3001234567'],
      });
    });
  });

  it.each([
    ['informal', 'Informal'],
    ['en_proceso', 'En proceso'],
    ['formalizada', 'Formalizada'],
    ['esal', 'ESAL'],
    ['esal_rte', 'ESAL + RTE'],
  ])(
    'Formalización pill reflects the REAL state machine value %s → %s (not a binary Formal/Informal)',
    async (state, label) => {
      stubFetch(() => ({ ...BASE_ORG, formalizationState: state }));
      renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });
      const main = within(screen.getByRole('main'));
      const formalizacion = await main.findByRole('link', { name: /Formalización/ });
      expect(formalizacion).toHaveTextContent(label);
    },
  );

  it('RBAC: a non-editor role sees the top bar but the read-only summary, never the tabs or Guardar', async () => {
    renderShell({ route: '/organizacion', ...sessionWith([Role.ReadOnlyAuditor]) });
    await screen.findByRole('heading', { name: 'Perfil de la organización' });

    const main = within(screen.getByRole('main'));
    // Informational top-bar items stay visible...
    expect(await main.findByRole('link', { name: /Formalización/ })).toBeInTheDocument();
    // ...but there is nothing to save.
    expect(main.queryByRole('button', { name: /Guardar cambios/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Datos institucionales' })).not.toBeInTheDocument();
    // Unique to `ReadOnlyProfile` (the name itself is also duplicated in the
    // always-shown `ProfileHeaderBanner`, so assert on a read-only-only row).
    expect(screen.getByText('/o/patitas-felices')).toBeInTheDocument();
  });
});
