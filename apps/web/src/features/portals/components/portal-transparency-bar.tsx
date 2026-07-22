import type { OrganizationPublic } from '@adoptafacil/contracts';
import {
  ACCOUNTABILITY_INTEGRATION_POINT,
  TransparencyIndicator,
  TransparencyProvider,
  deriveTransparency,
} from '../../../shell/transparency';

export interface PortalTransparencyBarProps {
  organization: OrganizationPublic;
}

/**
 * Indicador de transparencia del portal público (§M14) con DATOS REALES:
 *   - nivel            ← `verificationLevel.level` (contrato de @sebastian).
 *   - % formalización  ← DERIVADO de la posición en FORMALIZATION_SEQUENCE.
 *   - rendición        ← PLACEHOLDER tipado hasta M05/M06 (no se inventa el dato).
 *
 * Reutiliza el `TransparencyProvider`/`TransparencyIndicator` del shell (T-021)
 * alimentándolo con los datos derivados del `OrganizationPublic` ya obtenido, sin
 * un fetch adicional. La nota documenta el punto de integración de la rendición.
 */
export function PortalTransparencyBar({ organization }: PortalTransparencyBarProps) {
  const data = deriveTransparency({
    verificationLevel: organization.verificationLevel,
    formalizationState: organization.formalizationState,
  });

  return (
    <div className="space-y-1" data-testid="portal-transparency">
      <TransparencyProvider value={{ status: 'ready', data }}>
        <TransparencyIndicator />
      </TransparencyProvider>
      <p
        className="text-xs text-muted-foreground"
        data-integration-point={ACCOUNTABILITY_INTEGRATION_POINT}
      >
        Rendición de cuentas: disponible cuando la organización tenga campañas y donaciones
        (M05/M06).
      </p>
    </div>
  );
}
