import type { PortalLogoPosition, PortalSocialNavPosition } from '@adoptafacil/contracts';

export interface PortalMiniPreviewProps {
  organizationName?: string;
  /** Raw HSL channels ("H S% L%"), same format the color pickers write. */
  primary?: string;
  primaryForeground?: string;
  secondary?: string;
  accent?: string;
  accentForeground?: string;
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
 * Mini-réplica PURA del portal público (S2-PORTAL), pensada para la columna de
 * vista previa de `/organizacion/portal`. Sin fetch, sin datos reales — solo
 * recibe los valores en edición del formulario como props y los refleja al
 * instante (cambia el picker de color o el toggle de posición → esto se
 * redibuja). Solo divs coloreados; ~320px de ancho, no un iframe.
 */
export function PortalMiniPreview({
  organizationName = 'Tu organización',
  primary = '172 67% 30%',
  primaryForeground = '0 0% 100%',
  secondary = '213 20% 93%',
  accent = '169 55% 94%',
  accentForeground = '214 32% 18%',
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

        {/* Tabs: Portafolio | Nosotros | Información — la primera "activa". */}
        <div className="flex gap-1">
          {['Portafolio', 'Nosotros', 'Información'].map((label, i) => (
            <span
              key={label}
              className="rounded px-1.5 py-0.5"
              style={
                i === 0
                  ? { backgroundColor: `hsl(${accent})`, color: `hsl(${accentForeground})` }
                  : { color: 'hsl(var(--muted-foreground))' }
              }
            >
              {label}
            </span>
          ))}
        </div>

        {/* Contenido: catálogo + sidebar, orden según socialNavPosition. */}
        <div
          className={`flex gap-2 ${socialNavPosition === 'left' ? 'flex-row-reverse' : 'flex-row'}`}
        >
          <div className="grid grid-cols-3 gap-1.5">
            {PET_PLACEHOLDERS.map((emoji, i) => (
              <div
                key={i}
                className="flex h-9 w-9 items-center justify-center rounded"
                style={{ backgroundColor: `hsl(${secondary})` }}
              >
                {emoji}
              </div>
            ))}
          </div>
          <div
            className="flex flex-1 flex-col gap-1 rounded border border-border p-1.5"
            style={{ backgroundColor: `hsl(${secondary} / 0.4)` }}
          >
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
