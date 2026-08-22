import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * `/organizacion/representante-legal` (M01, S-1). El dibujo a mano alzada
 * (canvas) no es práctico de simular en jsdom, así que estos tests cubren la
 * ruta de "subir imagen" — el mismo endpoint recibe la firma en ambos casos,
 * la diferencia es solo cómo se captura el base64 en el navegador.
 *
 * jsdom no implementa `HTMLCanvasElement.getContext('2d')` (lanza
 * "Not implemented") — `SignaturePad` ya lo maneja con un try/catch (no
 * revienta el componente), pero el error interno de jsdom seguía disparando
 * un evento asíncrono que a veces mataba el worker de Vitest ("Worker exited
 * unexpectedly") en la suite completa. Se evita de raíz reemplazando
 * `getContext` por un contexto 2D mínimo mientras vive este archivo, en vez
 * de depender de que jsdom nunca llegue a ese camino roto.
 */
function stubCanvasContext2D() {
  const fakeContext = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    lineWidth: 0,
    lineCap: 'round',
    strokeStyle: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    fakeContext as unknown as CanvasRenderingContext2D,
  );
}
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'owner-1',
        name: 'Dueña',
        email: 'duena@patitas.org',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
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

const REGISTERED = {
  id: 'rep-1',
  organizationId: 'org-1',
  memberId: 'owner-1',
  fullName: 'Ana Pérez',
  documentType: 'cedula_ciudadania',
  documentNumber: '123',
  position: 'Representante legal',
  signatureFileRef: 'private/org-1/sig.enc',
  signatureHash: 'a'.repeat(64),
  status: 'active',
  signedAt: '2026-08-01T00:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
};

beforeEach(() => stubCanvasContext2D());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OrgLegalRepresentativePage (M01, S-1)', () => {
  it('shows an empty state + registration form for the Owner when none is registered yet', async () => {
    stubFetch(() => null);
    renderShell({ route: '/organizacion/representante-legal', ...sessionWith([Role.Owner]) });

    expect(
      await screen.findByText('Aún no has registrado un representante legal'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Registrar representante legal' }),
    ).toBeInTheDocument();
  });

  it('shows the CURRENT representative as "Vigente" when one already exists', async () => {
    stubFetch(() => REGISTERED);
    renderShell({ route: '/organizacion/representante-legal', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Vigente')).toBeInTheDocument();
    // "Representante legal" appears both as the page title (PageHeader) and as
    // the card's `position` text — assert at least the card's own occurrence.
    expect(screen.getAllByText('Representante legal').length).toBeGreaterThanOrEqual(2);
  });

  it('hides the registration form entirely for a non-Owner (Administrator) — read-only', async () => {
    stubFetch(() => REGISTERED);
    renderShell({
      route: '/organizacion/representante-legal',
      ...sessionWith([Role.Administrator]),
    });

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: /Registrar representante legal|cambio de representante/,
      }),
    ).not.toBeInTheDocument();
  });

  it('registers via an uploaded signature image and shows the new record as vigente', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST') {
        return { ...REGISTERED, id: 'rep-2', fullName: 'Nuevo Representante' };
      }
      return null; // GET on mount: nothing registered yet
    });
    renderShell({ route: '/organizacion/representante-legal', ...sessionWith([Role.Owner]) });

    await screen.findByText('Aún no has registrado un representante legal');
    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Nuevo Representante' },
    });
    fireEvent.change(screen.getByLabelText('Número de documento'), { target: { value: '999' } });
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Directora' } });

    fireEvent.click(screen.getByRole('button', { name: 'Subir imagen' }));
    const file = new File(['fake-signature-bytes'], 'firma.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Subir imagen de la firma'), {
      target: { files: [file] },
    });

    // FileReader.readAsDataURL is async even in jsdom — wait for the visible
    // "firma lista" confirmation instead of racing the click against it.
    await screen.findByText('✓ Firma lista');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar representante legal' }));

    const post = await waitFor(() => {
      const found = calls.find((c) => c.init?.method === 'POST');
      expect(found).toBeDefined();
      return found;
    });
    const body = JSON.parse(String(post?.init?.body));
    expect(body.fullName).toBe('Nuevo Representante');
    expect(body.signatureBase64).toEqual(expect.any(String));
    expect(body.signatureBase64.length).toBeGreaterThan(0);

    expect(await screen.findByText('Representante legal registrado')).toBeInTheDocument();
  });

  it('blocks submitting without a signature, with a clear message', async () => {
    stubFetch(() => null);
    renderShell({ route: '/organizacion/representante-legal', ...sessionWith([Role.Owner]) });

    await screen.findByText('Aún no has registrado un representante legal');
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Número de documento'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar representante legal' }));

    expect(await screen.findByText('Falta la firma')).toBeInTheDocument();
  });
});
