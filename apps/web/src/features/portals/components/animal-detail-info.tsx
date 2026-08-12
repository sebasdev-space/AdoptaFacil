import type { AnimalSummary } from '@adoptafacil/contracts';
import { Badge, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';
import {
  ageLabel,
  SEX_LABELS,
  SIZE_LABELS,
  SPECIES_LABELS,
  STATUS_LABELS,
} from '../model/animals-catalog';

export interface AnimalDetailInfoProps {
  animal: AnimalSummary;
  /** Ciudad de la organización — solo la conoce el catálogo general
   *  (`PublicAnimalSummary.organization.city`); el detalle de un solo portal
   *  no la trae (mismo contexto, ya se sabe qué organización es). */
  city?: string;
}

/**
 * Foto + identidad + datos públicos (sexo/tamaño/edad/estado) de un animal —
 * extraído de `PublicAnimalDetailPage` (pulido visual: el catálogo general
 * ahora también lo usa dentro de `AnimalDetailModal`, sin reimplementar esta
 * parte). Solo campos PÚBLICOS de `AnimalSummary`, nunca expediente clínico.
 *
 * Contenedor de imagen de tamaño FIJO (evita que el contenido/botones queden
 * cortados por una foto muy alta) con `object-contain`: la foto nunca se
 * recorta ni se deforma; el espacio sobrante toma el color de fondo del
 * contenedor en vez de forzar un crop.
 */
export function AnimalDetailInfo({ animal, city }: AnimalDetailInfoProps) {
  return (
    <>
      <div className="flex h-64 w-full items-center justify-center bg-muted">
        {animal.photoUrl ? (
          <img src={animal.photoUrl} alt={animal.name} className="h-full w-full object-contain" />
        ) : (
          <span aria-hidden className="text-sm text-muted-foreground">
            Sin foto
          </span>
        )}
      </div>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {animal.name}
          <Badge variant="secondary">{SPECIES_LABELS[animal.species]}</Badge>
          {animal.breed && <Badge variant="outline">{animal.breed}</Badge>}
          <Badge variant={animal.status === 'available' ? 'success' : 'outline'}>
            {STATUS_LABELS[animal.status]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Sexo</dt>
            <dd className="text-sm">{SEX_LABELS[animal.sex]}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Tamaño</dt>
            <dd className="text-sm">{SIZE_LABELS[animal.size]}</dd>
          </div>
          {animal.computedAge && (
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Edad aproximada</dt>
              <dd className="text-sm">{ageLabel(animal.computedAge)}</dd>
            </div>
          )}
          {city && (
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Ciudad</dt>
              <dd className="text-sm">{city}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </>
  );
}
