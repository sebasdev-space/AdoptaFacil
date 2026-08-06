import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignCategory, CampaignStatus, Role, type Campaign } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * S2-01 — `/organizacion/campanas`, la gestión interna de campañas reconectada
 * al router (T-065 la había sacado del menú). Usa SOLO los endpoints ya
 * existentes (`GET`/`POST /campaigns`); crear/editar: Owner/Administrator/
 * Operator, ver: + ReadOnlyAuditor (no existe el rol "Coordinator").
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

function campaign(id: string, title: string, over: Partial<Campaign> = {}): Campaign {
  return {
    id,
    organizationId: 'org-1',
    title,
    category: CampaignCategory.Medications,
    goalAmount: 1000000,
    raisedAmount: 250000,
    progress: 0.25,
    deadline: '2026-12-31T00:00:00.000Z',
    status: CampaignStatus.Active,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
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

describe('CampaignsPage — gestión interna reconectada (S2-01)', () => {
  it('renders a management card per campaign read from the wrapped `.items`', async () => {
    stubFetch(() => ({
      items: [campaign('c1', 'Cirugía para Max'), campaign('c2', 'Alimento de emergencia')],
      total: 2,
      limit: 50,
      offset: 0,
    }));
    renderShell({ route: '/organizacion/campanas', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Cirugía para Max')).toBeInTheDocument();
    expect(screen.getByText('Alimento de emergencia')).toBeInTheDocument();
    expect(screen.getAllByTestId('campaign-manage-card')).toHaveLength(2);
  });

  it('shows a friendly empty state with a "Crear campaña" CTA for a manager', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    renderShell({ route: '/organizacion/campanas', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Aún no hay campañas de recaudación')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear tu primera campaña' })).toBeInTheDocument();
  });

  it('hides "Crear campaña" and the create form from a ReadOnlyAuditor (view-only)', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    renderShell({ route: '/organizacion/campanas', ...sessionWith([Role.ReadOnlyAuditor]) });

    await screen.findByRole('heading', { name: 'Campañas de recaudación' });
    expect(screen.queryByRole('button', { name: 'Crear campaña' })).not.toBeInTheDocument();
  });

  it('creates a campaign with the REAL required fields (category + single deadline, no image) and toasts success', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let created = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST' && url.includes('/campaigns')) {
        created = true;
        return campaign('c1', 'Cirugía para Max', { category: CampaignCategory.Surgeries });
      }
      return {
        items: created ? [campaign('c1', 'Cirugía para Max')] : [],
        total: created ? 1 : 0,
        limit: 50,
        offset: 0,
      };
    });
    renderShell({ route: '/organizacion/campanas', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Crear campaña' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Cirugía para Max' } });
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: CampaignCategory.Surgeries },
    });
    fireEvent.change(screen.getByLabelText('Meta (COP)'), { target: { value: '1000000' } });
    fireEvent.change(screen.getByLabelText('Fecha límite'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear campaña' }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(post).toBeDefined();
      const body = JSON.parse(String(post?.init?.body));
      expect(body).toMatchObject({
        title: 'Cirugía para Max',
        category: CampaignCategory.Surgeries,
        goalAmount: 1000000,
      });
      // No "fecha de fin"/image field ever sent — the real DTO has none.
      expect(body.endDate).toBeUndefined();
      expect(body.image).toBeUndefined();
    });
    expect(await screen.findByText('Campaña creada')).toBeInTheDocument();
  });
});
