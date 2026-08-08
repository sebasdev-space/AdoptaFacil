import { Badge } from '@adoptafacil/ui';

export interface DesignPreviewBannerProps {
  /** Detalle opcional de qué representa la maqueta en esta pantalla. */
  detail?: string;
}

/**
 * Etiqueta "VISTA DE DISEÑO" reutilizable para las pantallas MAQUETADAS del pitch
 * (T-053 → F-CERT-REAL, pasos 2-5 del flujo de confianza). Deja explícito y honesto
 * que la pantalla es un ANTICIPO del RF14 y aún no es funcional — la donación real
 * (paso 1) NUNCA lleva esta etiqueta. Es la superficie compartida por toda maqueta
 * institucional; reutilizar en lugar de duplicar el aviso.
 *
 * F-CERT-REAL (aprobado por Sebastián, 7-ago; copy del acuse): antes decía que
 * "los datos... son de muestra", pero desde este cambio org/donante/monto SON
 * reales — el copy se ajusta para no desmentir eso. Lo que sigue sin funcionar es
 * la VERIFICACIÓN pública (código/hash de muestra, sin backend) — nunca dar a
 * entender que valida contra un servidor.
 *
 * F1-03-COMPLETO: el borde punteado usaba `border-warning/50`, que contra este
 * fondo casi blanco no pasa 3:1 (WCAG UI) ni siquiera a opacidad 100% (`--warning`
 * es demasiado claro para este contraste). Se usa `--warning-foreground` en su
 * lugar — el mismo token semántico ya existente, pensado exactamente para leerse
 * sobre superficies claras — sin introducir ningún color nuevo.
 */
export function DesignPreviewBanner({ detail }: DesignPreviewBannerProps) {
  return (
    <div
      data-testid="design-preview"
      role="note"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed border-warning-foreground/70 bg-warning/10 px-3 py-2 text-sm text-foreground"
    >
      <Badge variant="warning">Vista de diseño</Badge>
      <span>
        Anticipo del certificado de donación. {detail ?? 'Certificado de presentación:'} los datos
        (organización, donante y monto) son reales; la verificación pública aún no es funcional.
      </span>
    </div>
  );
}
