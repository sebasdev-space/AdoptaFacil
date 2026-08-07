import { Link } from 'react-router-dom';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { buttonVariants, cn } from '@adoptafacil/ui';

/**
 * Construye el enlace al flujo de donación (§M05, T-050) con la organización
 * resuelta por query param — EXACTAMENTE el mecanismo que espera la página de
 * donación (`useDonationTarget`: organizationId + organizationName). No se
 * reimplementa la resolución de org; solo se le pasa.
 *
 * F2-03: logoUrl/ciudad/NIT viajan también, cuando el `OrganizationPublic` ya
 * cargado en el portal los trae — solo presentación en el checkout, opcionales
 * (mismo patrón que `photoUrl` en `buildAdoptionRequestHref`). El NIT es un
 * dato PÚBLICO una vez formalizada la org (`organization_public()`, expuesto
 * en este mismo endpoint que el portal ya consume) — nada nuevo se expone que
 * el visitante del portal no viera ya en esta misma página.
 */
export function buildDonateHref(
  org: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location'>,
): string {
  const params = new URLSearchParams({ organizationId: org.id, organizationName: org.name });
  if (org.logoUrl) params.set('organizationLogoUrl', org.logoUrl);
  if (org.nit) params.set('organizationNit', org.nit);
  if (org.location?.city) params.set('organizationCity', org.location.city);
  return `/donaciones?${params.toString()}`;
}

export interface PortalDonateCtaProps {
  organization: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location'>;
}

/**
 * CTA "Donar" del portal público (§M14). Es PÚBLICO (visible sin sesión): es un
 * enlace a la ruta protegida `/donaciones`. Si el visitante NO tiene sesión, el
 * guard `RequireAuth` de esa ruta lo manda a login con returnTo y, tras autenticarse
 * como Persona, regresa al flujo con la org preservada (query string). Si ya tiene
 * sesión, entra directo al desglose transparente.
 *
 * SEAM (donación de invitado): el gate de sesión NO está aquí sino en `RequireAuth`
 * sobre la ruta `/donaciones` (ver shell/router/routes.tsx). Si el cliente habilita
 * el checkout anónimo, basta relajar ESE guard; este CTA no cambia.
 *
 * Pulido visual (T-D02): vive en el sidebar del portal, full-width y prominente
 * (`size: 'lg'`). El `<Link>`/query params NO cambiaron — solo su posición y estilo.
 */
export function PortalDonateCta({ organization }: PortalDonateCtaProps) {
  return (
    <div className="flex flex-col items-stretch gap-1.5">
      <Link
        to={buildDonateHref(organization)}
        className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
        data-testid="portal-donate-cta"
      >
        Donar a {organization.name}
      </Link>
      <p className="text-center text-xs text-muted-foreground">
        Tu aporte es transparente: verás el desglose completo antes de pagar.
      </p>
    </div>
  );
}
