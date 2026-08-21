import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ResourceCategory,
  ResourceNeedStatus,
  Role,
  type ResourceNeed,
} from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * M09 (F-6) — `/organizacion/recursos`, gestión interna de necesidades.
 * Publicar/editar: Owner/Administrator/Operator; ver: + ReadOnlyAuditor
 * (calcado del @Roles real de `ResourceNeedsController`).
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

function need(id: string, title: string, over: Partial<ResourceNeed> = {}): ResourceNeed {
  return {
    id,
    organizationId: 'org-1',
    title,
    category: ResourceCategory.Food,
    quantityNeeded: 20,
    unit: 'kg',
    quantityFulfilled: 0,
    progress: 0,
    status: ResourceNeedStatus.Needed,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
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

describe('ResourcesPage — gestión interna del banco de recursos (F-6)', () => {
  it('renders a management card per need read from the wrapped `.items`', async () => {
    stubFetch(() => ({
      items: [need('n1', 'Alimento para gatos'), need('n2', 'Medicinas para perros')],
      total: 2,
      limit: 50,
      offset: 0,
    }));
    renderShell({ route: '/organizacion/recursos', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Alimento para gatos')).toBeInTheDocument();
    expect(screen.getByText('Medicinas para perros')).toBeInTheDocument();
    expect(screen.getAllByTestId('need-manage-card')).toHaveLength(2);
  });

  it('shows a friendly empty state with a "Publicar necesidad" CTA for a manager', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    renderShell({ route: '/organizacion/recursos', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Aún no hay necesidades publicadas')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Publicar tu primera necesidad' }),
    ).toBeInTheDocument();
  });

  it('hides "Publicar necesidad" from a ReadOnlyAuditor (view-only)', async () => {
    stubFetch(() => ({ items: [], total: 0, limit: 50, offset: 0 }));
    renderShell({ route: '/organizacion/recursos', ...sessionWith([Role.ReadOnlyAuditor]) });

    await screen.findByRole('heading', { name: 'Banco de recursos' });
    expect(screen.queryByRole('button', { name: 'Publicar necesidad' })).not.toBeInTheDocument();
  });

  it('publishes a need with the REAL required fields and toasts success', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let created = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST' && url.includes('/resources/needs')) {
        created = true;
        return need('n1', 'Alimento para gatos', { quantityNeeded: 20, unit: 'kg' });
      }
      return {
        items: created ? [need('n1', 'Alimento para gatos')] : [],
        total: created ? 1 : 0,
        limit: 50,
        offset: 0,
      };
    });
    renderShell({ route: '/organizacion/recursos', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Publicar necesidad' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Alimento para gatos' } });
    fireEvent.change(screen.getByLabelText('Cantidad necesitada'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Unidad'), { target: { value: 'kg' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publicar necesidad' }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(post).toBeDefined();
      const body = JSON.parse(String(post?.init?.body));
      expect(body).toMatchObject({
        title: 'Alimento para gatos',
        category: ResourceCategory.Food,
        quantityNeeded: 20,
        unit: 'kg',
      });
    });
    expect(await screen.findByText('Necesidad publicada')).toBeInTheDocument();
  });
});
