import { Link } from 'react-router-dom';
import type { PublicAnimalSummary } from '@adoptafacil/contracts';
import { AnimalCard } from '../../portals/components/animal-card';

export interface CatalogAnimalCardProps {
  animal: PublicAnimalSummary;
}

/**
 * Envuelve la `AnimalCard` compartida (`features/portals`, importada — NO
 * duplicada; ver `apps/web/src/features/portals/components/animal-card.tsx`)
 * con la atribución de organización que el catálogo GENERAL necesita (F-LANDING-01):
 * a qué organización pertenece cada animal, con acceso a su portal `/o/:slug`.
 * El detalle del animal (`/o/:slug/animales/:animalId`) lo sigue resolviendo
 * `AnimalCard` tal cual, sin tocar su lógica.
 */
export function CatalogAnimalCard({ animal }: CatalogAnimalCardProps) {
  const { organization } = animal;

  return (
    <div className="space-y-1.5">
      <AnimalCard slug={organization.slug} animal={animal} />
      <Link
        to={`/o/${encodeURIComponent(organization.slug)}`}
        className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        {organization.name}
        {organization.city ? ` · ${organization.city}` : ''}
      </Link>
    </div>
  );
}
