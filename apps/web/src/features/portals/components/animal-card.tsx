import { Link } from 'react-router-dom';
import type { AnimalSummary } from '@adoptafacil/contracts';
import { Badge, Card } from '@adoptafacil/ui';
import {
  SEX_LABELS,
  SPECIES_LABELS,
  ageLabel,
  publicAnimalDetailHref,
} from '../model/animals-catalog';

export interface AnimalCardProps {
  slug: string;
  animal: AnimalSummary;
}

/** Silueta simple (huella), usada como fallback cuando el animal no tiene foto. */
function PawPlaceholder() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-10 w-10 text-muted-foreground/50"
      fill="currentColor"
    >
      <circle cx="7" cy="8" r="2.2" />
      <circle cx="12" cy="5.5" r="2.2" />
      <circle cx="17" cy="8" r="2.2" />
      <path d="M12 12c-3.5 0-6.5 2.3-6.5 5.2 0 2 1.7 2.8 3.3 2 1-.5 2-1 3.2-1s2.2.5 3.2 1c1.6.8 3.3 0 3.3-2 0-2.9-3-5.2-6.5-5.2Z" />
    </svg>
  );
}

/**
 * Tarjeta pública de un animal adoptable (§M14/M03, pulido visual T-D02). Solo
 * campos PÚBLICOS de `AnimalSummary` (foto, nombre, especie, raza, edad, sexo) —
 * nada clínico. El detalle individual (`/o/:slug/animales/:animalId`, T-052) YA
 * existe y está cableado — se conserva el enlace tal cual (nav-state con el
 * `AnimalSummary`, para que el detalle no vuelva a pedir la lista).
 */
export function AnimalCard({ slug, animal }: AnimalCardProps) {
  const age = ageLabel(animal.computedAge);

  return (
    <Card className="overflow-hidden transition hover:shadow-md">
      <Link
        to={publicAnimalDetailHref(slug, animal.id)}
        state={{ animal }}
        data-testid="animal-card"
        className="block transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {animal.photoUrl ? (
          <img
            src={animal.photoUrl}
            alt={animal.name}
            className="aspect-[4/3] w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            aria-hidden
            className="flex aspect-[4/3] w-full items-center justify-center bg-muted"
          >
            <PawPlaceholder />
          </div>
        )}
        <div className="space-y-1.5 p-4">
          <p className="font-semibold leading-none">{animal.name}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {animal.breed && <span>{animal.breed}</span>}
            {animal.breed && age && <span aria-hidden>·</span>}
            {age && <span>{age}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="secondary">{SPECIES_LABELS[animal.species]}</Badge>
            <Badge variant="outline">{SEX_LABELS[animal.sex]}</Badge>
          </div>
        </div>
      </Link>
    </Card>
  );
}
