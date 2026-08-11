import { Link } from 'react-router-dom';
import type { AnimalSummary } from '@adoptafacil/contracts';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { buildAdoptionRequestHref, buildSponsorHref } from '../model/animals-catalog';

export interface AnimalDetailActionsProps {
  animal: Pick<AnimalSummary, 'id' | 'name' | 'species' | 'photoUrl' | 'organizationId'>;
  orgName?: string;
}

/**
 * "Solicitar adopción" + "Apadrinar" — extraído de `PublicAnimalDetailPage`
 * (pulido visual: reutilizado TAL CUAL, mismas rutas/`RequireAuth`, dentro de
 * `AnimalDetailModal`). No se reimplementa ninguna lógica de negocio, solo se
 * mueve la presentación a un componente compartido.
 */
export function AnimalDetailActions({ animal, orgName }: AnimalDetailActionsProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-1">
        <Link
          to={buildAdoptionRequestHref(animal.organizationId, animal)}
          className={cn(buttonVariants())}
          data-testid="request-adoption-cta"
        >
          Solicitar adopción
        </Link>
        <p className="text-xs text-muted-foreground">
          Necesitarás iniciar sesión como persona para enviar tu solicitud.
        </p>
      </div>

      <div className="flex flex-col items-start gap-1">
        <Link
          to={buildSponsorHref(animal, orgName)}
          className={cn(buttonVariants({ variant: 'outline' }))}
          data-testid="sponsor-animal-cta"
        >
          Apadrinar
        </Link>
        <p className="text-xs text-muted-foreground">
          Apadrina a {animal.name} con un aporte mensual, sin necesidad de adoptarlo.
        </p>
      </div>
    </div>
  );
}
