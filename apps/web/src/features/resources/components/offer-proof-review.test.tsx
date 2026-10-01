import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ResourceCategory,
  ResourceNeedStatus,
  ResourceOfferProofStatus,
  ResourceOfferStatus,
  Role,
  type ResourceOffer,
} from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * M09 — la organización revisa la PRUEBA del donante en el detalle de la
 * necesidad: aprobar / rechazar (con motivo) es explícito y distinto de
 * aceptar la oferta o completar la entrega.
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

const NEED = {
  id: 'need-1',
  organizationId: 'org-1',
  title: 'Alimento para gatos',
  category: ResourceCategory.Food,
  quantityNeeded: 20,
  unit: 'kg',
  quantityFulfilled: 0,
  progress: 0,
  status: ResourceNeedStatus.Needed,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function offer(over: Partial<ResourceOffer> = {}): ResourceOffer {
  return {
    id: 'off-1',
    organizationId: 'org-1',
    needId: 'need-1',
    donorUserId: 'donor-1',
    quantityOffered: 5,
    status: ResourceOfferStatus.Offered,
    proofStatus: ResourceOfferProofStatus.Pending,
    proofCount: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

function stubApi(offers: ResourceOffer[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      let body: unknown = {};
      if (url.endsWith('/resources/needs/need-1')) body = NEED;
      else if (url.includes('/resources/offers/received')) body = offers;
      else if (url.includes('/resources/deliveries')) body = { items: [], total: 0 };
      else if (url.endsWith('/proofs'))
        body = [
          {
            id: 'proof-1',
            organizationId: 'org-1',
            offerId: 'off-1',
            filename: 'factura.png',
            contentType: 'image/png',
            sizeBytes: 10,
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ];
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => body,
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OfferProofReview (detalle de la necesidad)', () => {
  it('shows the pending proof with its files and approves it explicitly', async () => {
    const calls = stubApi([offer()]);
    renderShell({ route: '/organizacion/recursos/need-1', ...sessionWith([Role.Operator]) });

    expect(await screen.findByText('Prueba por validar')).toBeInTheDocument();
    expect(await screen.findByText('factura.png')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar prueba' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH');
      expect(patch?.url).toContain('/resources/offers/off-1/proof-validation');
      expect(JSON.parse(String(patch?.init?.body))).toEqual({ decision: 'approve' });
    });
    expect(await screen.findByText('Prueba aprobada')).toBeInTheDocument();
  });

  it('requires a reason to reject and sends it', async () => {
    const calls = stubApi([offer()]);
    renderShell({ route: '/organizacion/recursos/need-1', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar prueba' }));
    expect(await screen.findByText('Falta el motivo')).toBeInTheDocument();
    expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(false);

    fireEvent.change(screen.getByLabelText('Motivo del rechazo de la prueba'), {
      target: { value: 'Foto borrosa' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar prueba' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH');
      expect(JSON.parse(String(patch?.init?.body))).toEqual({
        decision: 'reject',
        reason: 'Foto borrosa',
      });
    });
  });

  it('does not offer validation to a read-only auditor, nor for an already decided proof', async () => {
    stubApi([offer()]);
    renderShell({ route: '/organizacion/recursos/need-1', ...sessionWith([Role.ReadOnlyAuditor]) });
    expect(await screen.findByText('Prueba por validar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar prueba' })).not.toBeInTheDocument();
  });

  it('renders nothing for an offer without proof and hides buttons once decided', async () => {
    stubApi([
      offer({ id: 'off-2', proofStatus: undefined, proofCount: 0 }),
      offer({
        id: 'off-3',
        proofStatus: ResourceOfferProofStatus.Rejected,
        proofValidationReason: 'Ilegible',
      }),
    ]);
    renderShell({ route: '/organizacion/recursos/need-1', ...sessionWith([Role.Owner]) });
    expect(await screen.findByText('Prueba rechazada')).toBeInTheDocument();
    expect(screen.getByText('Motivo: Ilegible')).toBeInTheDocument();
    expect(screen.getAllByTestId('offer-proof-review')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Aprobar prueba' })).not.toBeInTheDocument();
  });
});
