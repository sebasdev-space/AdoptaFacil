import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

/** Route by URL: `/org/profile` gets its own body (default: no slug), everything
 *  else (the theme endpoint) gets `themeBody`. */
function stubFetchByUrl(
  themeBody: unknown,
  orgProfileBody: unknown = { id: 'org-1', name: 'Org' },
) {
  stubFetch((url) => (url.includes('/org/profile') ? orgProfileBody : themeBody));
}

beforeEach(() => {
  stubFetch(() => ({ tokens: {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalThemePage — owner personalization', () => {
  it('denies editing to a user without Owner/Administrator (deny-by-default)', async () => {
    // An org role that is NOT Owner/Administrator: passes the route-level
    // ORG_MEMBER_ROLES gate (T-062) and reaches the page, whose OWN internal
    // check still blocks editing to non-Owner/Administrator roles.
    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Operator]) });

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

  it('shows a color picker reflecting the saved HSL as hex, and typing hex updates the HSL text (T-D03)', async () => {
    stubFetchByUrl({ tokens: { primary: '0 0% 0%' } });
    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });

    const text = await screen.findByLabelText('Color primario');
    expect(text).toHaveValue('0 0% 0%');
    const picker = screen.getByLabelText('Selector de color: Color primario');
    expect(picker).toHaveValue('#000000');

    // Picking white in the picker updates the underlying HSL text field.
    fireEvent.change(picker, { target: { value: '#ffffff' } });
    expect(await screen.findByLabelText('Color primario')).toHaveValue('0 0% 100%');
  });

  it('shows "Ver portal público" linking to /o/:slug when the org has one, hidden otherwise (T-D03)', async () => {
    stubFetchByUrl(
      { tokens: {} },
      { id: 'org-1', name: 'Refugio Patitas', slug: 'patitas-felices' },
    );
    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });

    const link = await screen.findByRole('link', { name: /Ver portal público/ });
    expect(link).toHaveAttribute('href', '/o/patitas-felices');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('hides "Ver portal público" when the org has no slug yet (never a broken link)', async () => {
    stubFetchByUrl({ tokens: {} }, { id: 'org-1', name: 'Refugio Patitas' });
    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });

    await screen.findByLabelText('Color primario');
    expect(screen.queryByRole('link', { name: /Ver portal público/ })).not.toBeInTheDocument();
  });

  it('the live preview reflects the accent color from the FORM, not just the saved tokens (T-D03)', async () => {
    stubFetchByUrl({ tokens: {} });
    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });

    const accentText = await screen.findByLabelText('Color de acento');
    fireEvent.change(accentText, { target: { value: '0 0% 0%' } });

    const preview = screen.getByTestId('theme-preview');
    const chip = within(preview).getByText('Acento');
    expect(chip).toHaveStyle({ backgroundColor: 'hsl(0 0% 0%)' });
  });
});
