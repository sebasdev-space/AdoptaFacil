import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Animal } from '@adoptafacil/contracts';
import { AnimalIdCard } from './animal-id-card';

const ANIMAL: Animal = {
  id: '0b1c2d30-1111-2222-3333-444455556666',
  organizationId: 'org-1',
  name: 'Michi',
  species: 'cat',
  sex: 'male',
  size: 'medium',
  status: 'available',
  photos: ['https://cdn.test/michi.jpg'],
  breed: 'Abisinio',
  computedAge: { years: 1, months: 2, totalMonths: 14, approximate: false },
  tags: ['Juguetón', 'Tímido'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('AnimalIdCard', () => {
  it('muestra los datos reales del animal en el frente y el reverso', async () => {
    render(
      <AnimalIdCard animal={ANIMAL} code="A0B1C2D3" profileUrl="https://app.test/o/x/animales/y" />,
    );

    expect(screen.getByRole('heading', { name: 'Michi' })).toBeInTheDocument();
    expect(screen.getByAltText('Foto de Michi')).toHaveAttribute(
      'src',
      'https://cdn.test/michi.jpg',
    );
    expect(screen.getByText('Macho')).toBeInTheDocument();
    expect(screen.getAllByText('Abisinio').length).toBeGreaterThan(0);
    expect(screen.getByText('N° A0B1C2D3')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Código de barras A0B1C2D3' })).toBeInTheDocument();

    expect(screen.getByText('Edad')).toBeInTheDocument();
    expect(screen.getByText('1 año 2 meses')).toBeInTheDocument();
    expect(screen.getByText('Juguetón, Tímido')).toBeInTheDocument();
    expect(await screen.findByAltText('Código QR del perfil del animal')).toBeInTheDocument();
  });

  it('sin raza, edad ni rasgos esas filas no se muestran (nunca se inventan)', () => {
    render(
      <AnimalIdCard
        animal={{ ...ANIMAL, breed: undefined, computedAge: undefined, tags: [], photos: [] }}
        code="A0B1C2D3"
        profileUrl="https://app.test"
      />,
    );

    expect(screen.queryByText('Edad')).not.toBeInTheDocument();
    expect(screen.queryByText('Raza')).not.toBeInTheDocument();
    expect(screen.queryByText('Carácter')).not.toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
    expect(screen.queryByAltText('Foto de Michi')).not.toBeInTheDocument();
  });
});
