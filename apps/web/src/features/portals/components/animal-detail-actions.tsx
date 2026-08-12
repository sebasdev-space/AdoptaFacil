import { Link } from 'react-router-dom';
import type { AnimalSummary } from '@adoptafacil/contracts';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { buildAdoptionRequestHref, buildSponsorHref } from '../model/animals-catalog';

export interface AnimalDetailActionsProps {
  animal: Pick<AnimalSummary, 'id' | 'name' | 'species' | 'photoUrl' | 'organizationId'>;
  orgName?: string;
  /** Slug del portal público de la organización — solo lo trae el catálogo
   *  general (`PublicAnimalSummary.organization.slug`, vía `AnimalDetailModal`).
   *  Cuando está presente se agrega el botón "Acceder a la organización". */
  organizationSlug?: string;
}

/**
 * "Solicitar adopción" + "Apadrinar" (+ "Acceder a la organización" cuando se
 * conoce su slug) — extraído de `PublicAnimalDetailPage` (pulido visual:
 * reutilizado TAL CUAL, mismas rutas/`RequireAuth`, dentro de
 * `AnimalDetailModal`). No se reimplementa ninguna lógica de negocio.
 *
 * Fila única, alineada a la derecha (antes: apiladas verticalmente en la
 * esquina inferior izquierda, ocupando espacio de más) — se envuelve en
 * pantallas angostas en vez de recortarse.
 */
export function AnimalDetailActions({
  animal,
  orgName,
  organizationSlug,
}: AnimalDetailActionsProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          to={buildAdoptionRequestHref(animal.organizationId, animal)}
          className={cn(buttonVariants())}
          data-testid="request-adoption-cta"
        >
          Solicitar adopción
        </Link>
        <Link
          to={buildSponsorHref(animal, orgName)}
          className={cn(buttonVariants({ variant: 'outline' }))}
          data-testid="sponsor-animal-cta"
        >
          Apadrinar
        </Link>
        {organizationSlug && (
          <Link
            to={`/o/${encodeURIComponent(organizationSlug)}`}
            className={cn(buttonVariants({ variant: 'outline' }))}
            data-testid="visit-organization-cta"
          >
            Acceder a la organización
          </Link>
        )}
      </div>
      <p className="text-right text-xs text-muted-foreground">
        Necesitarás iniciar sesión como persona para solicitar adopción o apadrinar a {animal.name}.
      </p>
    </div>
  );
}
