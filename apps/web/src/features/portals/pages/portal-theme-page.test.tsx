import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * §M14 (T-027) — owner personalization UI at `/organizacion/portal`.
 * Deny-by-default gating: only Owner/Administrator can edit the tokens. The real
 * authority is server-side (RolesGuard); here we assert the UI never exposes the
 * editor to a user without the role, and that an owner's save PUTs the tokens.
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

beforeEach(() => {
  stubFetch(() => ({ tokens: {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalThemePage — owner personalization', () => {
  it('denies editing to a user without Owner/Administrator (deny-by-default)', async () => {
    renderShell({ route: '/organizacion/portal', ...sessionWith([]) });

    expect(
      await screen.findByText('No tienes permiso para editar la personalización'),
    ).toBeInTheDocument();
    // No editor field is rendered for an unauthorized user.
    expect(screen.queryByLabelText('Color primario')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Guardar personalización/ }),
    ).not.toBeInTheDocument();
  });

  it('lets an Owner edit tokens and PUTs them on save', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'PUT') return { tokens: { primary: '24 90% 45%' } };
      return { tokens: {} };
    });

    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });

    const primary = await screen.findByLabelText('Color primario');
    fireEvent.change(primary, { target: { value: '24 90% 45%' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar personalización/ }));

    await waitFor(() => {
      const put = calls.find((c) => c.init?.method === 'PUT');
      expect(put).toBeDefined();
      expect(put?.url).toMatch(/\/portals\/theme$/);
      expect(JSON.parse(String(put?.init?.body))).toEqual({ tokens: { primary: '24 90% 45%' } });
    });
  });

  it('also allows an Administrator to edit', async () => {
    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Administrator]) });
    expect(await screen.findByLabelText('Color primario')).toBeInTheDocument();
  });
});
