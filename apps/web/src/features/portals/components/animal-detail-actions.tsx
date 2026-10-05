import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnimalSummary, OrganizationPublic } from '@adoptafacil/contracts';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { fetchAnimalSponsorshipSummary } from '../../sponsorships/api/public-sponsorships';
import { buildAdoptionRequestHref, buildSponsorHref } from '../model/animals-catalog';
import { buildDonateHref } from './portal-donate-cta';

export interface AnimalDetailActionsProps {
  animal: Pick<AnimalSummary, 'id' | 'name' | 'species' | 'photoUrl' | 'organizationId'>;
  orgName?: string;
  /** Slug del portal público de la organización — solo lo trae el catálogo
   *  general (`PublicAnimalSummary.organization.slug`, vía `AnimalDetailModal`).
   *  Cuando está presente se agrega el botón "Acceder a la organización". */
  organizationSlug?: string;
  /** Organización dueña del animal. Cuando se pasa se agrega el botón "Donar"
   *  (la donación es POR ORGANIZACIÓN, mismo flujo `/donaciones` del portal de la org). */
  donateOrganization?: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location'>;
}

/**
 * "Solicitar adopción" + "Apadrinar" (+ "Acceder a la organización" cuando se
 * conoce su slug) — extraído de `PublicAnimalDetailPage` (pulido visual:
 * reutilizado TAL CUAL, mismas rutas/`RequireAuth`, dentro de
 * `AnimalDetailModal`). No se reimplementa ninguna lógica de negocio.
 *
 * "Apadrinar" solo se ofrece si el animal tiene al menos un plan de
 * apadrinamiento activo (`GET /public/sponsorships/animals/:id`). Mientras
 * carga, o si la consulta falla, se oculta: nunca se ofrece apadrinar sin plan.
 *
 * Fila única, alineada a la derecha (antes: apiladas verticalmente en la
 * esquina inferior izquierda, ocupando espacio de más) — se envuelve en
 * pantallas angostas en vez de recortarse.
 */
export function AnimalDetailActions({
  animal,
  orgName,
  organizationSlug,
  donateOrganization,
}: AnimalDetailActionsProps) {
  const [hasSponsorshipPlan, setHasSponsorshipPlan] = useState(false);

  useEffect(() => {
    let active = true;
    setHasSponsorshipPlan(false);
    fetchAnimalSponsorshipSummary(animal.id)
      .then((summary) => {
        if (active) setHasSponsorshipPlan(summary.activePlans.length > 0);
      })
      .catch(() => {
        if (active) setHasSponsorshipPlan(false);
      });
    return () => {
      active = false;
    };
  }, [animal.id]);

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
        {hasSponsorshipPlan && (
          <Link
            to={buildSponsorHref(animal, orgName)}
            className={cn(buttonVariants({ variant: 'outline' }))}
            data-testid="sponsor-animal-cta"
          >
            Apadrinar
          </Link>
        )}
        {donateOrganization && (
          <Link
            to={buildDonateHref(donateOrganization)}
            className={cn(buttonVariants({ variant: 'outline' }))}
            data-testid="donate-organization-cta"
          >
            Donar
          </Link>
        )}
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
        {hasSponsorshipPlan
          ? `Necesitarás iniciar sesión como persona para solicitar adopción o apadrinar a ${animal.name}.`
          : `Necesitarás iniciar sesión como persona para solicitar adopción de ${animal.name}.`}
      </p>
    </div>
  );
}
