import { Badge } from '@adoptafacil/ui';
import { OrganizationType, type PortalOrganizationType } from '@adoptafacil/contracts';

/** Etiquetas legibles (es-CO) por tipo de organización. */
const ORG_TYPE_LABELS: Record<string, string> = {
  [OrganizationType.Foundation]: 'Fundación',
  [OrganizationType.Association]: 'Asociación',
  [OrganizationType.Corporation]: 'Corporación',
  [OrganizationType.Shelter]: 'Refugio',
  [OrganizationType.NaturalPerson]: 'Persona natural',
  [OrganizationType.Other]: 'Otro',
};

export interface OrgTypeBadgeProps {
  organizationType?: PortalOrganizationType;
}

/**
 * Badge de TIPO DE ORGANIZACIÓN del perfil (§M14, T-030). El enum canónico y la
 * política de visibilidad (`showOrganizationType`) son de @sebastian (módulo
 * `org`); M14 sólo lo RENDERIZA con su label legible.
 *
 * Deny-by-default de UI: si el tipo llega AUSENTE (p. ej. org informal bajo la
 * política `formalized_only`, que omite el campo en la proyección pública) NO se
 * pinta nada — nunca un badge vacío ni "undefined". Para valores fuera del enum
 * (forward-compat) se muestra el valor crudo.
 */
export function OrgTypeBadge({ organizationType }: OrgTypeBadgeProps) {
  if (!organizationType) {
    return null;
  }
  return (
    <Badge variant="info" data-testid="org-type-badge">
      {ORG_TYPE_LABELS[organizationType] ?? organizationType}
    </Badge>
  );
}
