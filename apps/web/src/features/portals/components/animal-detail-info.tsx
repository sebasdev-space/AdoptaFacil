import type { AnimalSummary } from '@adoptafacil/contracts';
import { Badge, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';
import { ageLabel, SEX_LABELS, SIZE_LABELS, SPECIES_LABELS } from '../model/animals-catalog';

export interface AnimalDetailInfoProps {
  animal: AnimalSummary;
}

/**
 * Foto + identidad + datos públicos (sexo/tamaño/edad) de un animal —
 * extraído de `PublicAnimalDetailPage` (pulido visual: el catálogo general
 * ahora también lo usa dentro de `AnimalDetailModal`, sin reimplementar esta
 * parte). Solo campos PÚBLICOS de `AnimalSummary`, nunca expediente clínico.
 */
export function AnimalDetailInfo({ animal }: AnimalDetailInfoProps) {
  return (
    <>
      {animal.photoUrl ? (
        <img src={animal.photoUrl} alt={animal.name} className="max-h-96 w-full object-cover" />
      ) : (
        <div
          aria-hidden
          className="flex h-56 w-full items-center justify-center bg-muted text-sm text-muted-foreground"
        >
          Sin foto
        </div>
      )}
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {animal.name}
          <Badge variant="secondary">{SPECIES_LABELS[animal.species]}</Badge>
          {animal.breed && <Badge variant="outline">{animal.breed}</Badge>}
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
        </dl>
      </CardContent>
    </>
  );
}
