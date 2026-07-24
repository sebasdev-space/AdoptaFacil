import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * T-028a — the person adoption-request form at `/adopciones/solicitar`. Enforces
 * the RF10 minimum message length in the UI; without a chosen animal it shows the
 * (typed) integration point with the M03 public catalog.
 */
function personSession() {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'p1',
        name: 'Adoptante',
        email: 'adoptante@test.local',
        roles: [] as Role[],
        organizationId: 'person-org',
        accountType: 'person' as const,
      },
    },
  };
}

const target = '/adopciones/solicitar?organizationId=org-9&animalId=an-9&name=Michi&species=cat';

describe('AdoptionRequestPage', () => {
  it('shows the M03 catalog integration point when no animal is chosen', async () => {
    renderShell({ route: '/adopciones/solicitar', ...personSession() });
    expect(await screen.findByText('Elige un animal desde el catálogo')).toBeInTheDocument();
  });

  it('requires the RF10 minimum message length before enabling submit', async () => {
    renderShell({ route: target, ...personSession() });

    // Form is shown for the chosen animal.
    expect(await screen.findByText('Michi')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Enviar solicitud' });
    expect(submit).toBeDisabled();

    // A short message keeps it disabled; a long enough one enables it.
    const textarea = screen.getByLabelText(/Por qué quieres adoptar/i);
    fireEvent.change(textarea, { target: { value: 'corto' } });
    expect(submit).toBeDisabled();
    fireEvent.change(textarea, {
      target: {
        value: 'Tengo espacio, tiempo y experiencia cuidando gatos rescatados con cariño.',
      },
    });
    expect(submit).toBeEnabled();
  });
});
