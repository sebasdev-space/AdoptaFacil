import { Link } from 'react-router-dom';
import type { AnimalSummary } from '@adoptafacil/contracts';
import { Badge, Card } from '@adoptafacil/ui';
import { SPECIES_LABELS, publicAnimalDetailHref } from '../model/animals-catalog';

export interface AnimalCardProps {
  slug: string;
  animal: AnimalSummary;
}

/**
 * Tarjeta pública de un animal adoptable (§M14/M03). Solo campos PÚBLICOS de
 * `AnimalSummary` (foto, nombre, especie, raza) — nada clínico. Enlaza al detalle
 * público y pasa el `AnimalSummary` por nav-state para que el detalle no tenga que
 * volver a pedir la lista al navegar desde aquí.
 */
export function AnimalCard({ slug, animal }: AnimalCardProps) {
  return (
    <Card className="overflow-hidden">
      <Link
        to={publicAnimalDetailHref(slug, animal.id)}
        state={{ animal }}
        data-testid="animal-card"
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {animal.photoUrl ? (
          <img
            src={animal.photoUrl}
            alt={animal.name}
            className="h-40 w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-40 w-full items-center justify-center bg-muted text-sm text-muted-foreground"
          >
            Sin foto
          </div>
        )}
        <div className="space-y-1.5 p-4">
          <p className="font-medium leading-none">{animal.name}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{SPECIES_LABELS[animal.species]}</Badge>
            {animal.breed && <Badge variant="outline">{animal.breed}</Badge>}
          </div>
        </div>
      </Link>
    </Card>
  );
}
