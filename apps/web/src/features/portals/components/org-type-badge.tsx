import { Badge } from '@adoptafacil/ui';
import type { PortalOrganizationType } from '@adoptafacil/contracts';

export interface OrgTypeBadgeProps {
  organizationType?: PortalOrganizationType;
}

/**
 * Badge de TIPO DE ORGANIZACIÓN del perfil. El enum canónico y sus valores son de
 * @sebastian (módulo `org`); M14 sólo RESERVA el hueco y lo renderiza desde el
 * contrato. Mientras la proyección pública no exponga el tipo, muestra el hueco
 * reservado (badge atenuado) en lugar de ocultarse, para que la maqueta del perfil
 * sea estable y el punto de integración quede visible.
 */
export function OrgTypeBadge({ organizationType }: OrgTypeBadgeProps) {
  if (!organizationType) {
    return (
      <Badge variant="outline" data-testid="org-type-badge" data-reserved="true">
        Tipo de organización
      </Badge>
    );
  }
  return (
    <Badge variant="info" data-testid="org-type-badge">
      {organizationType}
    </Badge>
  );
}
