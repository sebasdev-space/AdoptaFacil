import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormalizationState, Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * REFACTOR-VISUAL Fase C3 — `/organizacion/formalizacion` no tenía cobertura
 * previa. Cubre el cambio de estructura de este PR: el motivo/confirmación de
 * una transición vive en un modal, no como campo embebido junto a las
 * tarjetas de estado/historial (requisito del rediseño).
 */
function ownerSession() {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'owner-1',
        name: 'Owner Tester',
        email: 'owner@refugio.test',
        roles: [Role.Owner],
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

afterEach(() => vi.unstubAllGlobals());

describe('OrgFormalizationPage', () => {
  it('REFACTOR-VISUAL Fase C3: "Retroceder" opens a modal asking for a reason, not an inline field', async () => {
    stubFetch((url) => {
      if (url.includes('/org/formalization/history')) return [];
      if (url.includes('/org/formalization')) {
        return { state: FormalizationState.EnProceso, rteVigente: false };
      }
      return {};
    });
    renderShell({ route: '/organizacion/formalizacion', ...ownerSession() });

    await screen.findByRole('heading', { name: 'Formalización' });
    // No inline reason field before opening the modal.
    expect(screen.queryByLabelText('Motivo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retroceder a Informal' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Motivo')).toBeInTheDocument();
  });

  it('sends the real reason and refreshes on confirm', async () => {
    let transitioned = false;
    stubFetch((url, init) => {
      if (init?.method === 'POST' && url.includes('/org/formalization/transitions')) {
        transitioned = true;
        return {
          status: { state: FormalizationState.Informal, rteVigente: false },
          transition: {},
        };
      }
      if (url.includes('/org/formalization/history')) return [];
      if (url.includes('/org/formalization')) {
        return {
          state: transitioned ? FormalizationState.Informal : FormalizationState.EnProceso,
          rteVigente: false,
        };
      }
      return {};
    });
    renderShell({ route: '/organizacion/formalizacion', ...ownerSession() });

    fireEvent.click(await screen.findByRole('button', { name: 'Retroceder a Informal' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Motivo'), {
      target: { value: 'Documentación vencida, corrigiendo antes de re-enviar.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retroceder a Informal' }));

    expect(await screen.findByText('Estado actualizado')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
