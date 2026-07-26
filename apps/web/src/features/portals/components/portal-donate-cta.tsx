import { Link } from 'react-router-dom';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { buttonVariants, cn } from '@adoptafacil/ui';

/**
 * Construye el enlace al flujo de donación (§M05, T-050) con la organización
 * resuelta por query param — EXACTAMENTE el mecanismo que espera la página de
 * donación (`useDonationTarget`: organizationId + organizationName). No se
 * reimplementa la resolución de org; solo se le pasa.
 */
export function buildDonateHref(org: Pick<OrganizationPublic, 'id' | 'name'>): string {
  const params = new URLSearchParams({ organizationId: org.id, organizationName: org.name });
  return `/donaciones?${params.toString()}`;
}

export interface PortalDonateCtaProps {
  organization: Pick<OrganizationPublic, 'id' | 'name'>;
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
 */
export function PortalDonateCta({ organization }: PortalDonateCtaProps) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Link
        to={buildDonateHref(organization)}
        className={cn(buttonVariants())}
        data-testid="portal-donate-cta"
      >
        Donar a {organization.name}
      </Link>
      <p className="text-xs text-muted-foreground">
        Tu aporte es transparente: verás el desglose completo antes de pagar.
      </p>
    </div>
  );
}
