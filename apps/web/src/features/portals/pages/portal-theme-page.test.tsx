import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * §M14 (T-027) — owner personalization UI at `/organizacion/portal`.
 * Deny-by-default gating: only Owner/Administrator can edit the tokens. The real
 * authority is server-side (RolesGuard); here we assert the UI never exposes the
 * editor to a user without the role, and that an owner's save PUTs the tokens.
 *
 * S2-REORG: this page is now VISUAL ONLY (colors + layout + preview) — "Nosotros"/
 * contacto extendido moved to Mi organización (see org-profile-form.test.tsx).
 * `save()` PUTs a single endpoint (/portals/theme) — no more parallel PUT to
 * /org/profile. Color labels are plain Spanish ("Color principal", not "Color
 * primario") and the raw HSL text field is gone (compact pickers, S2-REORG §4.3).
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

describe('PortalThemePage — owner personalization (visual only, S2-REORG)', () => {
  it('denies editing to a user without Owner/Administrator (deny-by-default)', async () => {
    // An org role that is NOT Owner/Administrator: passes the route-level
    // ORG_MEMBER_ROLES gate (T-062) and reaches the page, whose OWN internal
    // check still blocks editing to non-Owner/Administrator roles.
    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Operator]) });

    expect(
      await screen.findByText('No tienes permiso para editar la personalización'),
    ).toBeInTheDocument();
    // No editor field is rendered for an unauthorized user.
    expect(screen.queryByLabelText('Color principal')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Guardar personalización/ }),
    ).not.toBeInTheDocument();
  });

  it('renames the section to plain Spanish (no "tokens" jargon)', async () => {
    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });
    expect(await screen.findByText('Colores de tu portal')).toBeInTheDocument();
    expect(screen.queryByText('Tokens de marca')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Color principal')).toBeInTheDocument();
  });

  it('lets an Owner edit a color and PUTs only /portals/theme on save (no more parallel PUT to /org/profile)', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'PUT') return { tokens: { primary: '24 90% 45%' } };
      return { tokens: {} };
    });

    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });

    const primary = await screen.findByLabelText('Color principal');
    fireEvent.change(primary, { target: { value: '#ff5500' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar personalización/ }));

    await waitFor(() => {
      const puts = calls.filter((c) => c.init?.method === 'PUT');
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toMatch(/\/portals\/theme$/);
      const body = JSON.parse(String(puts[0].init?.body));
      expect(body.logoPosition).toBe('left');
      expect(body.socialNavPosition).toBe('right');
      expect(body.tokens.primary).toMatch(/^\d+(\.\d+)? \d+% \d+%$/); // re-converted to HSL
    });
  });

  describe('T-PORTAL-CROSSED-INPUTS: no color input mutates a field it did not touch', () => {
    // Reported 3 veces seguidas como "cambiar el input N cambia el N-1 (o el
    // 'siguiente')". Verificado con un log temporal en `onChange`/`setToken`
    // (con evidencia real del propio usuario) que NUNCA hubo un desfase de
    // índice: cada input siempre escribía su propio token correctamente. Lo
    // que sí pasaba (y se decidió QUITAR, no arreglar): el fix de contraste
    // anterior autoajustaba el color EMPAREJADO cuando hacía falta — dos
    // campos cambiaban a la vez, y eso se percibía como "el otro cambió en
    // vez del mío". Decisión de producto: ya no se autoajusta ningún campo
    // ajeno — este test prueba exactamente eso, para las 7 entradas.
    const EXISTING_THEME: Record<string, string> = {
      primary: '172 67% 30%',
      'primary-foreground': '0 0% 100%',
      secondary: '213 20% 93%',
      'secondary-foreground': '214 32% 18%',
      accent: '169 55% 94%',
      'accent-foreground': '214 32% 18%',
      ring: '172 67% 30%',
    };

    // Colores elegidos a propósito para que, tras el cambio, cada par siga
    // cumpliendo contraste — así el test aísla el binding índice↔campo del
    // aviso de contraste (probado aparte más abajo).
    const CASES: Array<{ label: string; token: string; hex: string }> = [
      { label: 'Color principal', token: 'primary', hex: '#1a2a3a' },
      { label: 'Texto sobre el principal', token: 'primary-foreground', hex: '#f5f8ff' },
      { label: 'Color secundario', token: 'secondary', hex: '#e0e0e0' },
      { label: 'Texto sobre secundario', token: 'secondary-foreground', hex: '#101820' },
      { label: 'Color de acento', token: 'accent', hex: '#eaf7f0' },
      { label: 'Texto sobre acento', token: 'accent-foreground', hex: '#12211c' },
      { label: 'Anillo de foco', token: 'ring', hex: '#336699' },
    ];

    it.each(CASES)(
      'changing "$label" ($token) updates ONLY that field — the other 6 stay byte-identical',
      async ({ label, token, hex }) => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        stubFetch((url, init) => {
          calls.push({ url, init });
          if (init?.method === 'PUT') {
            const body = JSON.parse(String(init.body));
            return { tokens: body.tokens };
          }
          return { tokens: EXISTING_THEME };
        });
        renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });

        const input = await screen.findByLabelText(label);
        fireEvent.change(input, { target: { value: hex } });
        fireEvent.click(screen.getByRole('button', { name: /Guardar personalización/ }));

        await waitFor(() => {
          const put = calls.find((c) => c.init?.method === 'PUT');
          expect(put).toBeDefined();
          const body = JSON.parse(String(put?.init?.body));
          for (const key of Object.keys(EXISTING_THEME)) {
            if (key === token) {
              expect(body.tokens[key]).not.toBe(EXISTING_THEME[key]);
            } else {
              expect(body.tokens[key]).toBe(EXISTING_THEME[key]);
            }
          }
        });
      },
    );

    it('shows a clear, actionable warning (no silent color swap, no raw 400) when a combination lacks contrast, and never calls the API', async () => {
      const calls: Array<{ url: string; init?: RequestInit }> = [];
      stubFetch((url, init) => {
        calls.push({ url, init });
        if (init?.method === 'PUT') return { tokens: {} };
        return { tokens: { primary: '172 67% 30%', 'primary-foreground': '0 0% 100%' } };
      });
      renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });

      const primary = (await screen.findByLabelText('Color principal')) as HTMLInputElement;
      const primaryFg = screen.getByLabelText('Texto sobre el principal') as HTMLInputElement;
      const fgBefore = primaryFg.value;

      // Pale yellow background: fine against near-black, fails 4.5:1 against
      // the existing white foreground.
      fireEvent.change(primary, { target: { value: '#fef3c7' } });
      fireEvent.click(screen.getByRole('button', { name: /Guardar personalización/ }));

      expect(await screen.findByText('Revisa el contraste antes de guardar')).toBeInTheDocument();
      // Names both conflicting fields by their visible label, in one message
      // (distinct from the two <label> elements, which each name only one).
      expect(
        screen.getByText(
          /"Color principal" y "Texto sobre el principal" no tienen suficiente contraste/,
        ),
      ).toBeInTheDocument();

      // Never even reaches the backend — and the untouched field is NOT
      // silently moved to "fix" it.
      expect(calls.some((c) => c.init?.method === 'PUT')).toBe(false);
      expect(primaryFg.value).toBe(fgBefore);
    });
  });

  it('also allows an Administrator to edit', async () => {
    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Administrator]) });
    expect(await screen.findByLabelText('Color principal')).toBeInTheDocument();
  });

  it('shows the color picker reflecting the saved HSL as hex, with the raw HSL available on hover (S2-REORG §4.3)', async () => {
    stubFetchByUrl({ tokens: { primary: '0 0% 0%' } });
    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });

    const picker = await screen.findByLabelText('Color principal');
    expect(picker).toHaveValue('#000000');
    // No raw HSL text visible by default (compact pickers) — only a tooltip.
    expect(screen.queryByText('142 72% 29%')).not.toBeInTheDocument();
    expect(picker.closest('[title]')).toHaveAttribute('title', '0 0% 0%');
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

    await screen.findByLabelText('Color principal');
    expect(screen.queryByRole('link', { name: /Ver portal público/ })).not.toBeInTheDocument();
  });

  it('the live preview reflects the accent color from the FORM, not just the saved tokens (T-D03)', async () => {
    stubFetchByUrl({ tokens: {} });
    renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });

    const accentPicker = await screen.findByLabelText('Color de acento');
    fireEvent.change(accentPicker, { target: { value: '#000000' } });

    const preview = screen.getByTestId('theme-preview');
    const chip = within(preview).getByText('Acento');
    expect(chip).toHaveStyle({ backgroundColor: 'hsl(0 0% 0%)' });
  });

  describe('S2-PORTAL: diseño y mini-réplica (siguen en Personalización)', () => {
    it('renders the mini preview (no fetch — pure props from the form)', async () => {
      renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });
      await screen.findByLabelText('Color principal');
      expect(screen.getByTestId('portal-mini-preview')).toBeInTheDocument();
    });

    it('changing the logo position toggle updates the state and is included on save', async () => {
      const calls: Array<{ url: string; init?: RequestInit }> = [];
      stubFetch((url, init) => {
        calls.push({ url, init });
        if (init?.method === 'PUT' && url.includes('/portals/theme')) {
          return { tokens: {}, logoPosition: 'center', socialNavPosition: 'right' };
        }
        return { tokens: {} };
      });
      renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });
      await screen.findByLabelText('Color principal');

      fireEvent.click(screen.getByRole('button', { name: 'Centro' }));
      expect(screen.getByRole('button', { name: 'Centro' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      fireEvent.click(screen.getByRole('button', { name: /Guardar personalización/ }));
      await waitFor(() => {
        const put = calls.find((c) => c.url.includes('/portals/theme') && c.init?.method === 'PUT');
        expect(put).toBeDefined();
        expect(JSON.parse(String(put?.init?.body))).toMatchObject({ logoPosition: 'center' });
      });
    });
  });

  describe('S2-REORG: contenido de la organización ya NO vive aquí', () => {
    it('never shows "Nosotros"/contacto extendido — movidos a Mi organización', async () => {
      renderShell({ route: '/organizacion/portal', ...sessionWith([Role.Owner]) });
      await screen.findByLabelText('Color principal');

      expect(screen.queryByText('Sección: Nosotros / Acerca de')).not.toBeInTheDocument();
      expect(screen.queryByText('Acerca de nosotros')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Quiénes somos')).not.toBeInTheDocument();
      expect(screen.queryByText('Sección: Información de contacto')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Horario de atención')).not.toBeInTheDocument();
    });
  });
});
