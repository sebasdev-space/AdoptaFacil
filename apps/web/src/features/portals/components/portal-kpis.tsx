import { StatCard } from '@adoptafacil/ui';

export interface PortalKpisProps {
  /** Conteo real del catálogo público (ya cargado en `OrgPublicPage`, sin fetch nuevo). */
  animalCount?: number;
}

/**
 * Fila de métricas del portal público (pulido visual, imagen de referencia
 * usada solo como guía). Muestra ÚNICAMENTE lo que el backend ya expone hoy:
 * el conteo real de animales adoptables. La imagen de referencia también
 * mostraba adopciones/donaciones del año/% con evidencia/calificación, pero
 * ninguno de esos campos existe todavía en `OrganizationPublic`/`PortalView`
 * (sin conteo de adopciones completadas, sin agregado de donaciones, sin
 * campo de calificación) — no se inventan ni se muestran como "0"/"—"; se
 * documentan aquí como hallazgo para no fabricar una cifra.
 *
 * TODO(client): conectar cuando M04 (adopciones)/M05 (donaciones)/M07
 * (apadrinamientos) expongan agregados públicos por organización.
 */
export function PortalKpis({ animalCount }: PortalKpisProps) {
  if (typeof animalCount !== 'number') return null;

  return (
    <div className="flex flex-wrap gap-4" data-testid="portal-kpis">
      <StatCard className="w-full sm:w-64" label="Animales disponibles" value={animalCount} />
    </div>
  );
}
