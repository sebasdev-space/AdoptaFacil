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
