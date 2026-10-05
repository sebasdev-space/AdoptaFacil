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
  role: 'legal_representative',
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

const REGISTERED_ACCOUNTANT = {
  ...REGISTERED,
  id: 'rep-acct-1',
  role: 'accountant',
  fullName: 'Carlos Contador',
  position: 'Contador',
};

beforeEach(() => stubCanvasContext2D());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OrgLegalRepresentativePage (M01, S-1)', () => {
  it('shows an empty slot per role + registration form for the Owner when none is registered yet', async () => {
    stubFetch(() => []);
    renderShell({ route: '/organizacion/representante-legal', ...sessionWith([Role.Owner]) });

    expect(
      await screen.findByText('Aún no se ha registrado un representante legal.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Aún no se ha registrado un contador.')).toBeInTheDocument();
    expect(screen.getByText('Aún no se ha registrado un revisor fiscal.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Registrar representante legal' }),
    ).toBeInTheDocument();
  });

  it('shows the CURRENT representative as "Vigente" when one already exists', async () => {
    stubFetch((url) => (url.includes('/org/legal-representative') ? [REGISTERED] : []));
    renderShell({ route: '/organizacion/representante-legal', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Vigente')).toBeInTheDocument();
    // The other two roles stay unregistered — registering one never fills in the rest.
    expect(screen.getByText('Aún no se ha registrado un contador.')).toBeInTheDocument();
    expect(screen.getByText('Aún no se ha registrado un revisor fiscal.')).toBeInTheDocument();
  });

  it('keeps BOTH the legal representative and the accountant vigente at the same time (requerimiento #16)', async () => {
    // Scope the array response to THIS endpoint only — a blanket stub would
    // also hand it to unrelated shell calls (e.g. `/clinical-reminders`,
    // which expects an array of reminder objects, not legal representatives).
    stubFetch((url) => {
      if (url.includes('/org/legal-representative')) return [REGISTERED, REGISTERED_ACCOUNTANT];
      return [];
    });
    renderShell({ route: '/organizacion/representante-legal', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Carlos Contador')).toBeInTheDocument();
    expect(screen.getAllByText('Vigente')).toHaveLength(2);
    expect(screen.getByText('Aún no se ha registrado un revisor fiscal.')).toBeInTheDocument();
  });

  it('hides the registration form entirely for a non-Owner (Administrator) — read-only', async () => {
    stubFetch((url) => (url.includes('/org/legal-representative') ? [REGISTERED] : []));
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

  it('registers via an uploaded signature image, sends the selected role, and shows the new record as vigente', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST') {
        return { ...REGISTERED, id: 'rep-2', fullName: 'Nuevo Representante' };
      }
      return []; // GET on mount: nothing registered yet
    });
    renderShell({ route: '/organizacion/representante-legal', ...sessionWith([Role.Owner]) });

    await screen.findByText('Aún no se ha registrado un representante legal.');
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
    expect(body.role).toBe('legal_representative');
    expect(body.fullName).toBe('Nuevo Representante');
    expect(body.signatureBase64).toEqual(expect.any(String));
    expect(body.signatureBase64.length).toBeGreaterThan(0);

    expect(await screen.findByText('Representante legal registrado')).toBeInTheDocument();
  });

  it('registering the accountant while a legal representative is already vigente does NOT replace it', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST') return REGISTERED_ACCOUNTANT;
      // GET on mount: legal representative already vigente — scoped to this
      // endpoint only, so unrelated shell calls (e.g. `/clinical-reminders`)
      // don't receive a legal-representative payload as their own list.
      return url.includes('/org/legal-representative') ? [REGISTERED] : [];
    });
    renderShell({ route: '/organizacion/representante-legal', ...sessionWith([Role.Owner]) });

    await screen.findByText('Ana Pérez');
    fireEvent.change(screen.getByLabelText('Tipo de firmante'), {
      target: { value: 'accountant' },
    });
    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Carlos Contador' },
    });
    fireEvent.change(screen.getByLabelText('Número de documento'), { target: { value: '777' } });
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Contador' } });

    fireEvent.click(screen.getByRole('button', { name: 'Subir imagen' }));
    const file = new File(['fake-signature-bytes'], 'firma.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Subir imagen de la firma'), {
      target: { files: [file] },
    });
    await screen.findByText('✓ Firma lista');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contador' }));

    const post = await waitFor(() => {
      const found = calls.find((c) => c.init?.method === 'POST');
      expect(found).toBeDefined();
      return found;
    });
    expect(JSON.parse(String(post?.init?.body)).role).toBe('accountant');

    // Both are now shown as vigente — the new accountant did not replace Ana Pérez.
    expect(await screen.findByText('Carlos Contador')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getAllByText('Vigente')).toHaveLength(2);
  });

  it('blocks submitting without a signature, with a clear message', async () => {
    stubFetch(() => []);
    renderShell({ route: '/organizacion/representante-legal', ...sessionWith([Role.Owner]) });

    await screen.findByText('Aún no se ha registrado un representante legal.');
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Número de documento'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar representante legal' }));

    expect(await screen.findByText('Falta la firma')).toBeInTheDocument();
  });
});
