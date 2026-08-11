import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role, type Animal, type AnimalBreed } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * S2-04A — rediseño de `/animales`: listado como grid de cards (con
 * editar/eliminar/expediente), registro/edición en modal, tags de
 * personalidad y catálogo de razas con buscador. Ningún endpoint de LECTURA
 * cambia; `DELETE /animals/:id` es nuevo (soft-remove, Owner/Administrator).
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

function animal(id: string, name: string, over: Partial<Animal> = {}): Animal {
  return {
    id,
    organizationId: 'org-1',
    name,
    species: 'dog',
    sex: 'male',
    size: 'medium',
    status: 'available',
    photos: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    isActive: true,
    tags: [],
    ...over,
  };
}

function breed(id: string, name: string, species: AnimalBreed['species'] = 'dog'): AnimalBreed {
  return { id, organizationId: 'org-1', species, name, createdAt: '2026-07-01T00:00:00.000Z' };
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
        blob: async () => new Blob([JSON.stringify(body)]),
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AnimalsPage — listado + modal (S2-04A)', () => {
  it('renders a card per animal, with species/breed/tags and an inactive badge', async () => {
    stubFetch((url) => {
      if (url.includes('/animals/breeds')) return [];
      if (url.includes('/animals')) {
        return [
          animal('a1', 'Firulais', { breed: 'Labrador Retriever', tags: ['Juguetón', 'Cariñoso'] }),
          animal('a2', 'Michú', { species: 'cat', isActive: false }),
        ];
      }
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText('Michú')).toBeInTheDocument();
    expect(screen.getByText('Labrador Retriever')).toBeInTheDocument();
    expect(screen.getByText('Juguetón')).toBeInTheDocument();
    expect(screen.getByText('Cariñoso')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('shows a friendly empty state with a CTA for a manager', async () => {
    stubFetch(() => []);
    renderShell({ route: '/animales', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Registra tu primer animal para empezar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Registrar tu primer animal/ })).toBeInTheDocument();
  });

  it('filters the grid by name (client-side, no extra request)', async () => {
    stubFetch((url) => {
      if (url.includes('/animals/breeds')) return [];
      if (url.includes('/animals')) return [animal('a1', 'Firulais'), animal('a2', 'Michú')];
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.Owner]) });

    await screen.findByText('Firulais');
    fireEvent.change(screen.getByLabelText('Buscar por nombre'), { target: { value: 'mich' } });

    expect(screen.queryByText('Firulais')).not.toBeInTheDocument();
    expect(screen.getByText('Michú')).toBeInTheDocument();
  });

  it('hides create/edit/delete actions from a ReadOnlyAuditor (view-only)', async () => {
    stubFetch((url) => {
      if (url.includes('/animals/breeds')) return [];
      if (url.includes('/animals')) return [animal('a1', 'Firulais')];
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.ReadOnlyAuditor]) });

    await screen.findByText('Firulais');
    expect(screen.queryByRole('button', { name: /Registrar animal/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
  });

  it('creates an animal with tags via the modal and toasts success', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let created = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/animals/breeds')) return [breed('b1', 'Labrador Retriever')];
      if (init?.method === 'POST' && url.endsWith('/animals')) {
        created = true;
        return animal('a1', 'Firulais');
      }
      if (url.includes('/animals')) return created ? [animal('a1', 'Firulais')] : [];
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: /Registrar animal/ }));
    fireEvent.change(await screen.findByLabelText('Nombre *'), { target: { value: 'Firulais' } });

    const tagInput = screen.getByLabelText('Etiquetas de personalidad');
    fireEvent.change(tagInput, { target: { value: 'Juguetón' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    expect(screen.getByText('Juguetón')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar animal' }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST' && c.url.endsWith('/animals'));
      expect(post).toBeDefined();
      const body = JSON.parse(String(post?.init?.body));
      expect(body).toMatchObject({ name: 'Firulais', tags: ['Juguetón'] });
    });
    expect(await screen.findByText('Expediente creado')).toBeInTheDocument();
  });

  it('opens the edit modal prefilled and PATCHes the update', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/animals/breeds')) return [];
      if (init?.method === 'PATCH') return animal('a1', 'Firulais 2');
      if (url.includes('/animals')) return [animal('a1', 'Firulais', { tags: ['Tímido'] })];
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.Owner]) });

    await screen.findByText('Firulais');
    fireEvent.click(screen.getByRole('button', { name: /Editar/ }));

    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText('Nombre *');
    expect(nameInput).toHaveValue('Firulais');
    expect(within(dialog).getByText('Tímido')).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: 'Firulais 2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch?.url).toContain('/animals/a1');
      const body = JSON.parse(String(patch?.init?.body));
      expect(body.name).toBe('Firulais 2');
      expect(body.tags).toEqual(['Tímido']);
    });
  });

  it('deletes an animal after confirming, and cancel keeps it', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let removed = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/animals/breeds')) return [];
      if (init?.method === 'DELETE') {
        removed = true;
        return {};
      }
      if (url.includes('/animals')) return removed ? [] : [animal('a1', 'Firulais')];
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.Owner]) });

    await screen.findByText('Firulais');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Firulais' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Firulais' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    await waitFor(() => {
      const del = calls.find((c) => c.init?.method === 'DELETE');
      expect(del).toBeDefined();
      expect(del?.url).toContain('/animals/a1');
    });
    expect(await screen.findByText('Animal eliminado')).toBeInTheDocument();
  });

  it('offers "Reactivar" instead of "Eliminar" for an inactive animal', async () => {
    stubFetch((url) => {
      if (url.includes('/animals/breeds')) return [];
      if (url.includes('/animals')) return [animal('a1', 'Firulais', { isActive: false })];
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.Owner]) });

    await screen.findByText('Firulais');
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar Firulais' })).not.toBeInTheDocument();
  });
});

describe('AnimalsPage — importación masiva desde Excel (S2-04B-1)', () => {
  it('hides "Importar Excel" from a Veterinarian (narrower than canManage)', async () => {
    stubFetch((url) => {
      if (url.includes('/animals/breeds')) return [];
      if (url.includes('/animals')) return [];
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.Veterinarian]) });

    await screen.findByText('Registra tu primer animal para empezar');
    expect(screen.queryByRole('button', { name: /Importar Excel/ })).not.toBeInTheDocument();
  });

  it('uploads a file and shows the created/failed report with per-row errors', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/animals/breeds')) return [];
      if (url.endsWith('/animals/bulk-import') && init?.method === 'POST') {
        return {
          totalRows: 2,
          created: 1,
          failed: 1,
          errors: [{ row: 3, field: 'Especie', message: 'Especie no reconocida.' }],
        };
      }
      if (url.includes('/animals')) return [];
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: /Importar Excel/ }));
    const dialog = await screen.findByRole('dialog');

    const file = new File(['bytes'], 'animales.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = within(dialog).getByLabelText('Archivo (.xlsx)');
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Importar' }));

    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/animals/bulk-import'));
      expect(post).toBeDefined();
      expect(post?.init?.body).toBeInstanceOf(FormData);
    });
    expect(await within(dialog).findByText('1 creados')).toBeInTheDocument();
    expect(within(dialog).getByText('1 con errores')).toBeInTheDocument();
    expect(within(dialog).getByText('Especie no reconocida.')).toBeInTheDocument();
    expect(await screen.findByText('1 creados, 1 con errores')).toBeInTheDocument();
  });

  it('downloads the template via requestBlob when "Descargar plantilla" is clicked', async () => {
    const calls: string[] = [];
    stubFetch((url) => {
      calls.push(url);
      if (url.includes('/animals/breeds')) return [];
      if (url.includes('/animals')) return [];
      return {};
    });
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    renderShell({ route: '/animales', ...sessionWith([Role.Owner]) });
    fireEvent.click(await screen.findByRole('button', { name: /Importar Excel/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Descargar plantilla/ }));

    await waitFor(() => {
      expect(calls.some((u) => u.includes('/animals/bulk-import/template'))).toBe(true);
    });
    expect(createObjectURL).toHaveBeenCalled();
  });
});

describe('AnimalsPage — activar apadrinamiento desde la ficha (S2-03-REV)', () => {
  it('hides the "Apadrinamiento" action from an Operator (narrower than canManage)', async () => {
    stubFetch((url) => {
      if (url.includes('/animals/breeds')) return [];
      if (url.includes('/animals')) return [animal('a1', 'Firulais')];
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.Operator]) });

    await screen.findByText('Firulais');
    // Scoped to <main> (MENU-SUBMENUS): the shell sidebar also renders an
    // "Apadrinamientos" toggle button (unrelated to this per-animal action),
    // so an unscoped query would see it in every renderShell()-mounted test.
    expect(
      within(screen.getByRole('main')).queryByRole('button', { name: /Apadrinamiento/ }),
    ).not.toBeInTheDocument();
  });

  it('lets an Owner create a plan for an animal with none yet', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let created = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/animals/breeds')) return [];
      if (init?.method === 'POST' && url.includes('/sponsorship-plans')) {
        created = true;
        return {
          id: 'plan-1',
          organizationId: 'org-1',
          animalId: 'a1',
          name: 'Apadrinamiento mensual',
          amount: 25000,
          periodicity: 'monthly',
          isActive: true,
          createdAt: '2026-08-08T00:00:00.000Z',
        };
      }
      if (url.includes('/sponsorship-plans')) {
        return {
          items: created
            ? [
                {
                  id: 'plan-1',
                  organizationId: 'org-1',
                  animalId: 'a1',
                  name: 'Apadrinamiento mensual',
                  amount: 25000,
                  periodicity: 'monthly',
                  isActive: true,
                  createdAt: '2026-08-08T00:00:00.000Z',
                },
              ]
            : [],
          total: created ? 1 : 0,
          limit: 1,
          offset: 0,
        };
      }
      if (url.includes('/animals')) return [animal('a1', 'Firulais')];
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.Owner]) });

    await screen.findByText('Firulais');
    // Scoped to <main> — see the note in the "hides the Apadrinamiento action" test above.
    fireEvent.click(
      within(screen.getByRole('main')).getByRole('button', { name: /Apadrinamiento/ }),
    );

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/todavía no tiene un plan/);
    fireEvent.change(within(dialog).getByLabelText('Monto mensual (COP)'), {
      target: { value: '25000' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear plan' }));

    await waitFor(() => {
      const post = calls.find(
        (c) => c.init?.method === 'POST' && c.url.includes('/sponsorship-plans'),
      );
      expect(post).toBeDefined();
      const body = JSON.parse(String(post?.init?.body));
      expect(body).toMatchObject({ animalId: 'a1', amount: 25000, periodicity: 'monthly' });
    });
    expect(await within(dialog).findByText('Activo')).toBeInTheDocument();
    expect(await screen.findByText('Plan de apadrinamiento creado')).toBeInTheDocument();
  });

  it('lets an Owner deactivate an existing active plan via PATCH', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let active = true;
    const planRow = () => ({
      id: 'plan-1',
      organizationId: 'org-1',
      animalId: 'a1',
      name: 'Apadrinamiento mensual',
      amount: 25000,
      periodicity: 'monthly',
      isActive: active,
      createdAt: '2026-08-08T00:00:00.000Z',
    });
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/animals/breeds')) return [];
      if (init?.method === 'PATCH' && url.includes('/sponsorship-plans/plan-1')) {
        active = false;
        return planRow();
      }
      if (url.includes('/sponsorship-plans'))
        return { items: [planRow()], total: 1, limit: 1, offset: 0 };
      if (url.includes('/animals')) return [animal('a1', 'Firulais')];
      return [];
    });
    renderShell({ route: '/animales', ...sessionWith([Role.Administrator]) });

    await screen.findByText('Firulais');
    // Scoped to <main> — see the note in the "hides the Apadrinamiento action" test above.
    fireEvent.click(
      within(screen.getByRole('main')).getByRole('button', { name: /Apadrinamiento/ }),
    );

    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Activo');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar plan' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch?.url).toContain('/sponsorship-plans/plan-1');
      expect(JSON.parse(String(patch?.init?.body))).toEqual({ isActive: false });
    });
    expect(await within(dialog).findByText('Inactivo')).toBeInTheDocument();
    expect(await screen.findByText('Plan desactivado')).toBeInTheDocument();
  });
});
