import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/** jsdom no implementa `getContext('2d')` — `SignaturePad` ya lo maneja con
 *  un try/catch, pero el error interno de jsdom puede matar el worker de
 *  Vitest; se evita de raíz igual que `org-legal-representative-page.test.tsx`. */
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

function sessionWith(roles: Role[], userId = 'owner-1') {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: userId,
        name: 'Dueña',
        email: 'duena@refugio.test',
        roles,
        organizationId: 'org-1',
        accountType: roles.length ? ('organization' as const) : ('person' as const),
      },
    },
  };
}

const BASE_PAYLOAD = {
  requestId: 'req-1',
  organizationId: 'org-1',
  animalId: 'an-1',
  animal: { animalId: 'an-1', name: 'Firulais', species: 'dog' as const },
  applicant: { fullName: 'Juan Adoptante', email: 'juan@test.local' },
  applicableLaws: ['Ley 527/1999', 'Ley 1581/2012'] as const,
  terms: '',
  data: { followUpMonths: 6, weightKg: 18, healthStatusAtDelivery: 'Sano' },
};

const DRAFT_CONTRACT = {
  id: 'c1',
  organizationId: 'org-1',
  requestId: 'req-1',
  animalId: 'an-1',
  version: 1,
  status: 'draft',
  signers: [
    {
      id: 's-rep',
      role: 'organization_representative' as const,
      fullName: 'Representante de la organización',
      email: 'owner@refugio.test',
      userId: 'owner-1',
    },
    {
      id: 's-adopter',
      role: 'adopter' as const,
      fullName: 'Juan Adoptante',
      email: 'juan@test.local',
      userId: 'adopter-1',
    },
  ],
  payload: BASE_PAYLOAD,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
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

beforeEach(() => stubCanvasContext2D());
afterEach(() => vi.unstubAllGlobals());

describe('AdoptionContractPage (M04, T-028b — nuevo requerimiento)', () => {
  it('org: muestra el texto legal con los datos ya diligenciados, y permite editar + firmar como representante', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let signed = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/signatures') && init?.method === 'POST') {
        signed = true;
        return {
          ...DRAFT_CONTRACT,
          signers: DRAFT_CONTRACT.signers.map((s) =>
            s.id === 's-rep'
              ? { ...s, fullName: 'María Fernanda Gómez', signedAt: '2026-10-02T00:00:00.000Z' }
              : s,
          ),
        };
      }
      if (url.includes('/data') && init?.method === 'PATCH') {
        return {
          ...DRAFT_CONTRACT,
          payload: { ...BASE_PAYLOAD, data: { ...BASE_PAYLOAD.data, weightKg: 20 } },
        };
      }
      if (url.includes('/org/')) {
        return signed
          ? {
              ...DRAFT_CONTRACT,
              signers: DRAFT_CONTRACT.signers.map((s) =>
                s.id === 's-rep' ? { ...s, signedAt: '2026-10-02T00:00:00.000Z' } : s,
              ),
            }
          : DRAFT_CONTRACT;
      }
      return {};
    });
    renderShell({
      route: '/adopciones/contratos/c1',
      ...sessionWith([Role.Owner]),
    });

    expect(await screen.findByText('CONTRATO DE ADOPCIÓN DE ANIMAL')).toBeInTheDocument();
    expect(screen.getByText(/Firulais/)).toBeInTheDocument();
    expect(screen.getByText(/18 kg/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Firmar como representante' }));
    expect(await screen.findByText('Firmado como representante')).toBeInTheDocument();

    const signCall = calls.find((c) => c.url.includes('/signatures') && c.init?.method === 'POST');
    expect(signCall).toBeDefined();
    expect(JSON.parse(String(signCall?.init?.body))).toEqual({ signerId: 's-rep' });
  });

  it('org: "Enviar a firmas" solo aparece una vez el representante ya firmó', async () => {
    stubFetch((url) => {
      if (url.includes('/org/')) {
        return {
          ...DRAFT_CONTRACT,
          signers: DRAFT_CONTRACT.signers.map((s) =>
            s.id === 's-rep' ? { ...s, signedAt: '2026-10-02T00:00:00.000Z' } : s,
          ),
        };
      }
      return {};
    });
    renderShell({ route: '/adopciones/contratos/c1', ...sessionWith([Role.Owner]) });

    expect(await screen.findByRole('button', { name: 'Enviar a firmas' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Firmar como representante' }),
    ).not.toBeInTheDocument();
  });

  it('adoptante: dibuja su firma y firma su parte una vez el contrato fue enviado a firmas', async () => {
    const PENDING = {
      ...DRAFT_CONTRACT,
      status: 'pending_signatures',
      signers: DRAFT_CONTRACT.signers.map((s) =>
        s.id === 's-rep' ? { ...s, signedAt: '2026-10-02T00:00:00.000Z' } : s,
      ),
    };
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/signatures') && init?.method === 'POST') {
        return { ...PENDING, status: 'signed', contentHash: 'a'.repeat(64) };
      }
      // Adopter is NOT a manager — reads via the signer-identity route (no /org/).
      if (url.endsWith('/adoptions/contracts/c1')) return PENDING;
      return {};
    });
    renderShell({
      route: '/adopciones/contratos/c1',
      ...sessionWith([], 'adopter-1'),
    });

    await screen.findByText('CONTRATO DE ADOPCIÓN DE ANIMAL');
    expect(screen.getByRole('button', { name: 'Firmar' })).toBeDisabled();

    // Usa el camino de "subir imagen" — dibujar en el <canvas> requiere
    // `setPointerCapture`, que jsdom no implementa (mismo motivo por el que
    // `org-legal-representative-page.test.tsx` también prueba la subida, no
    // el dibujo, para su flujo principal).
    fireEvent.click(screen.getByRole('button', { name: 'Subir imagen' }));
    const file = new File(['fake-signature-bytes'], 'firma.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Subir imagen de la firma'), {
      target: { files: [file] },
    });

    await screen.findByText('✓ Firma lista');
    fireEvent.click(screen.getByRole('button', { name: 'Firmar' }));

    const signCall = await waitFor(() => {
      const found = calls.find((c) => c.url.includes('/signatures') && c.init?.method === 'POST');
      expect(found).toBeDefined();
      return found;
    });
    const body = JSON.parse(String(signCall?.init?.body));
    expect(body.signerId).toBe('s-adopter');
    expect(body.signatureBase64).toEqual(expect.any(String));
    expect(await screen.findByText('Firma registrada')).toBeInTheDocument();
  });

  it('ofrece "Descargar PDF" en cualquier estado', async () => {
    stubFetch((url) => (url.includes('/org/') ? DRAFT_CONTRACT : {}));
    renderShell({ route: '/adopciones/contratos/c1', ...sessionWith([Role.Owner]) });

    expect(await screen.findByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument();
  });
});
