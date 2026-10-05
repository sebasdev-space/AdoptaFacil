import type { PortalLogoPosition, PortalSocialNavPosition } from '@adoptafacil/contracts';

export interface PortalMiniPreviewProps {
  organizationName?: string;
  /** Raw HSL channels ("H S% L%"), same format the color pickers write. */
  primary?: string;
  primaryForeground?: string;
  accent?: string;
  accentForeground?: string;
  ring?: string;
  logoPosition?: PortalLogoPosition;
  socialNavPosition?: PortalSocialNavPosition;
}

const LOGO_JUSTIFY: Record<PortalLogoPosition, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

/** Genérico, sin datos reales — solo para dar una idea de proporción. */
const PET_PLACEHOLDERS = ['🐕', '🐈', '🐕'];

/**
 * Mini-réplica del portal público (S2-PORTAL), pensada para la columna de
 * vista previa de `/organizacion/portal`. Sin fetch, sin datos reales — solo
 * recibe los valores en edición del formulario como props y los refleja al
 * instante. Solo divs coloreados; ~380px de ancho, no un iframe.
 *
 * ESTRUCTURA Y TOKENS ALINEADOS AL PORTAL REAL DE HOY
 * (T-PERSONALIZACION-AUDIT, auditoría contra `org-public-page.tsx` y los
 * `.module.scss` del portal):
 * - Sin tabs: el rediseño T-D04 reemplazó el layout de tabs ("Portafolio /
 *   Nosotros / Información") por scroll único con anclas. La versión anterior
 *   de este preview seguía dibujando esas tabs — le mostraba al dueño un
 *   portal que ya no existe.
 * - Sin `secondary`: ese token se QUITÓ del todo (no pinta nada en el portal
 *   real) — las tarjetas de mascotas usan un tono neutro fijo, igual que en
 *   el portal real (no hay ningún color editable detrás de esas tarjetas).
 * - `accent`/`accent-foreground` se ven en la insignia "Nuevo" de una tarjeta,
 *   exactamente donde se usan de verdad (`public-catalog.module.scss`), no
 *   como una pestaña activa decorativa que no corresponde a nada real.
 * - `ring` se ve como el resplandor de foco del buscador del catálogo,
 *   también su ubicación real (`public-catalog.module.scss`).
 */
export function PortalMiniPreview({
  organizationName = 'Tu organización',
  primary = '172 67% 30%',
  primaryForeground = '0 0% 100%',
  accent = '169 55% 94%',
  accentForeground = '214 32% 18%',
  ring = '172 67% 30%',
  logoPosition = 'left',
  socialNavPosition = 'right',
}: PortalMiniPreviewProps) {
  return (
    <div
      className="mx-auto w-full max-w-[380px] overflow-hidden rounded-lg border border-border bg-background text-[10px] shadow-sm"
      aria-hidden
      data-testid="portal-mini-preview"
    >
      {/* Cover: el color primario en vez de una imagen real. */}
      <div className="relative h-16" style={{ backgroundColor: `hsl(${primary})` }}>
        <div className={`absolute -bottom-3 flex w-full px-3 ${LOGO_JUSTIFY[logoPosition]}`}>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background text-[9px] font-semibold"
            style={{ backgroundColor: `hsl(${primary})`, color: `hsl(${primaryForeground})` }}
          >
            {organizationName.slice(0, 1).toUpperCase()}
          </div>
        </div>
      </div>

      <div className="space-y-2 px-3 pt-5 pb-3">
        <p className="truncate font-semibold text-foreground">{organizationName}</p>

        {/* Buscador del catálogo: el resplandor de foco (`ring`) es su
         *  ubicación real — se muestra siempre "enfocado" para que el cambio
         *  de color sea visible sin necesidad de interactuar. */}
        <div
          className="flex h-5 items-center rounded border px-1.5 text-[9px] text-muted-foreground"
          style={{
            borderColor: `hsl(${primary} / 0.5)`,
            boxShadow: `0 0 0 2px hsl(${ring} / 0.25)`,
          }}
        >
          Buscar…
        </div>

        {/* Contenido: catálogo + sidebar, scroll único (sin tabs, T-D04),
         *  orden según socialNavPosition. */}
        <div
          className={`flex gap-2 ${socialNavPosition === 'left' ? 'flex-row-reverse' : 'flex-row'}`}
        >
          <div className="grid grid-cols-3 gap-1.5">
            {PET_PLACEHOLDERS.map((emoji, i) => (
              <div
                key={i}
                className="relative flex h-9 w-9 items-center justify-center rounded bg-muted"
              >
                {emoji}
                {/* Insignia "Nuevo": única tarjeta que la lleva, igual que en
                 *  el catálogo real (solo las mascotas recién publicadas). */}
                {i === 0 && (
                  <span
                    className="absolute -top-1 -right-1 rounded px-0.5 text-[6px] font-bold leading-tight"
                    style={{ backgroundColor: `hsl(${accent})`, color: `hsl(${accentForeground})` }}
                  >
                    Nuevo
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-1 rounded border border-border bg-muted/40 p-1.5">
            <span className="font-medium text-foreground">Redes</span>
            <span
              className="rounded px-1 py-0.5 text-center"
              style={{ backgroundColor: `hsl(${primary})`, color: `hsl(${primaryForeground})` }}
            >
              Donar
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
