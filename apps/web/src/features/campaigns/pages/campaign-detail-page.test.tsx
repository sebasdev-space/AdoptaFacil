import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CampaignCategory,
  CampaignEvidenceType,
  CampaignStatus,
  Role,
  type Campaign,
  type CampaignEvidence,
} from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * S2-01 — `/organizacion/campanas/:id`: editar la campaña y gestionar sus
 * evidencias de rendición (RF16), usando SOLO endpoints ya existentes. El
 * upload de evidencia es en DOS pasos (POST metadata → PUT bytes), igual que
 * las fotos de animales.
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

const CAMPAIGN: Campaign = {
  id: 'c1',
  organizationId: 'org-1',
  title: 'Cirugía para Max',
  description: 'Necesitamos cubrir la cirugía de cadera de Max.',
  category: CampaignCategory.Surgeries,
  goalAmount: 2000000,
  raisedAmount: 500000,
  progress: 0.25,
  deadline: '2026-12-31T00:00:00.000Z',
  status: CampaignStatus.Active,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const EVIDENCE: CampaignEvidence = {
  id: 'e1',
  organizationId: 'org-1',
  campaignId: 'c1',
  type: CampaignEvidenceType.Invoice,
  concept: 'Compra de insumos quirúrgicos',
  amount: 120000,
  spentAt: '2026-07-02T00:00:00.000Z',
  storageRef: 'campaigns/c1/evidences/e1.pdf',
  order: 0,
  createdAt: '2026-07-02T00:00:00.000Z',
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

/** Routes by URL/method: campaign GET/PATCH, evidences list/POST/PATCH/DELETE, storage PUT. */
function stubCampaignApi({
  campaign = CAMPAIGN,
  evidences = [EVIDENCE],
}: {
  campaign?: Campaign;
  evidences?: CampaignEvidence[];
} = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  stubFetch((url, init) => {
    calls.push({ url, init });
    const method = init?.method ?? 'GET';
    if (url.includes('/storage/upload')) return {};
    if (url.includes('/evidences')) {
      if (method === 'POST') {
        return {
          evidence: { ...EVIDENCE, id: 'e2', concept: 'Nueva evidencia' },
          upload: { url: 'http://localhost:3000/storage/upload?key=k2', key: 'k2' },
        };
      }
      if (method === 'PATCH' || method === 'DELETE') return {};
      return { items: evidences, total: evidences.length, limit: 50, offset: 0 };
    }
    if (method === 'PATCH') return { ...campaign, ...JSON.parse(String(init?.body ?? '{}')) };
    return campaign;
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CampaignDetailPage (S2-01)', () => {
  it('loads and shows the campaign data and its evidences', async () => {
    stubCampaignApi();
    renderShell({ route: '/organizacion/campanas/c1', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Compra de insumos quirúrgicos')).toBeInTheDocument();
    expect(screen.getAllByText('Cirugía para Max').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Ver cómo se ve en público/ })).toHaveAttribute(
      'href',
      '/campanas/c1',
    );
  });

  it('hides edit and evidence-write controls for a ReadOnlyAuditor (view-only)', async () => {
    stubCampaignApi();
    renderShell({ route: '/organizacion/campanas/c1', ...sessionWith([Role.ReadOnlyAuditor]) });

    await screen.findByText('Compra de insumos quirúrgicos');
    expect(screen.queryByRole('heading', { name: 'Editar campaña' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar evidencia' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('saves an edit via PATCH and toasts success', async () => {
    const calls = stubCampaignApi();
    renderShell({ route: '/organizacion/campanas/c1', ...sessionWith([Role.Owner]) });

    const titleInput = await screen.findByLabelText('Título');
    fireEvent.change(titleInput, { target: { value: 'Cirugía urgente para Max' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH' && !c.url.includes('/evidences'));
      expect(patch).toBeDefined();
      const body = JSON.parse(String(patch?.init?.body));
      expect(body.title).toBe('Cirugía urgente para Max');
    });
    expect(await screen.findByText('Campaña actualizada')).toBeInTheDocument();
  });

  it('adds an evidence via the two-step flow (POST metadata → PUT bytes) and toasts success', async () => {
    const calls = stubCampaignApi();
    renderShell({ route: '/organizacion/campanas/c1', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Agregar evidencia' }));
    fireEvent.change(screen.getByLabelText('Concepto'), {
      target: { value: 'Nueva evidencia' },
    });
    fireEvent.change(screen.getByLabelText('Fecha del gasto'), {
      target: { value: '2026-07-05' },
    });
    const file = new File(['x'], 'factura.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Archivo/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar evidencia' }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST' && c.url.includes('/evidences'));
      expect(post).toBeDefined();
      const put = calls.find((c) => c.init?.method === 'PUT' && c.url.includes('/storage/upload'));
      expect(put).toBeDefined();
    });
    expect(await screen.findByText('Evidencia agregada')).toBeInTheDocument();
  });

  it('deletes an evidence and toasts success', async () => {
    const calls = stubCampaignApi();
    renderShell({ route: '/organizacion/campanas/c1', ...sessionWith([Role.Owner]) });

    const row = (await screen.findByText('Compra de insumos quirúrgicos')).closest('li');
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => {
      expect(
        calls.some((c) => c.init?.method === 'DELETE' && c.url.includes('/evidences/e1')),
      ).toBe(true);
    });
    expect(await screen.findByText('Evidencia eliminada')).toBeInTheDocument();
  });
});
