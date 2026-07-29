import { Badge, Card, CardContent, CardHeader } from '@adoptafacil/ui';
import { FormalizationState, type PortalProfile } from '@adoptafacil/contracts';
import { OrgTypeBadge } from './org-type-badge';

export interface PortalProfileSectionProps {
  profile: PortalProfile;
  /** Total de animales adoptables (conteo real del catálogo público), si ya cargó. */
  animalCount?: number;
}

const HEADING_ID = 'portal-profile-heading';

/** Etiquetas legibles (es-CO) del estado de formalización (§14, RF02). */
const FORMALIZATION_LABELS: Record<FormalizationState, string> = {
  [FormalizationState.Informal]: 'Informal',
  [FormalizationState.EnProceso]: 'En proceso',
  [FormalizationState.Formalizada]: 'Formalizada',
  [FormalizationState.ESAL]: 'ESAL',
  [FormalizationState.ESAL_RTE]: 'ESAL + RTE',
};

/** Iniciales (máx. 2) para el avatar circular de respaldo cuando no hay logo. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

/**
 * Sección "perfil": identidad pública REAL de la organización (pulido visual
 * T-D02) — hero con portada + logo, nombre, badges de tipo/formalización, y una
 * fila de stats reales (ubicación, animales disponibles, formalización). Lee
 * directamente `profile.organization` (contrato `OrganizationPublic`), por lo que
 * hereda por contrato cualquier cambio en los campos públicos que publique
 * @sebastian — sin reproyectar. El nivel de verificación NUNCA se muestra aquí
 * (siempre 0 hasta que exista el catálogo, T-103) y las redes sociales/contacto
 * viven en el sidebar (`PortalSocialLinks`), no en esta card.
 */
export function PortalProfileSection({ profile, animalCount }: PortalProfileSectionProps) {
  const { organization: org, organizationType } = profile;
  const cover = org.coverPhotos?.[0];
  const formalizationLabel = org.formalizationState
    ? (FORMALIZATION_LABELS[org.formalizationState] ?? org.formalizationState)
    : undefined;
  const isEsal = org.formalizationState === FormalizationState.ESAL;
  const location = [org.location?.city, org.location?.department, org.location?.country]
    .filter(Boolean)
    .join(', ');

  return (
    <section aria-labelledby={HEADING_ID}>
      <Card className="overflow-hidden">
        {/* Hero: portada + logo circular sobre el borde inferior. */}
        <div className="relative">
          {cover ? (
            <img src={cover} alt="" className="h-48 w-full object-cover sm:h-60" />
          ) : (
            <div
              aria-hidden
              className="h-48 w-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent sm:h-60"
            />
          )}
          <div className="absolute -bottom-10 left-6">
            {org.logoUrl ? (
              <img
                src={org.logoUrl}
                alt={`Logo de ${org.name}`}
                className="h-20 w-20 rounded-full border-4 border-card object-cover shadow-md sm:h-24 sm:w-24"
              />
            ) : (
              <div
                aria-hidden
                className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-primary text-lg font-semibold text-primary-foreground shadow-md sm:h-24 sm:w-24 sm:text-xl"
              >
                {initials(org.name)}
              </div>
            )}
          </div>
        </div>

        <CardHeader className="gap-2 pt-12 sm:pt-14">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id={HEADING_ID} className="text-2xl font-bold tracking-tight">
              {org.name}
            </h1>
            <OrgTypeBadge organizationType={organizationType} />
            {formalizationLabel && (
              <Badge variant={isEsal ? 'success' : 'secondary'}>
                {isEsal ? `✓ ${formalizationLabel}` : formalizationLabel}
              </Badge>
            )}
            {org.rteVigente && <Badge variant="success">RTE vigente</Badge>}
          </div>
          {org.nit && (
            <p className="text-xs text-muted-foreground">
              NIT: <span className="text-foreground">{org.nit}</span>
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {org.description && (
            <p className="line-clamp-4 text-sm text-muted-foreground">{org.description}</p>
          )}
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {location && (
              <div className="flex items-center gap-1.5">
                <span aria-hidden>📍</span>
                <dt className="sr-only">Ubicación</dt>
                <dd>{location}</dd>
              </div>
            )}
            {typeof animalCount === 'number' && (
              <div className="flex items-center gap-1.5">
                <span aria-hidden>🐾</span>
                <dt className="sr-only">Animales disponibles</dt>
                <dd>
                  {animalCount} {animalCount === 1 ? 'animal disponible' : 'animales disponibles'}
                </dd>
              </div>
            )}
            {formalizationLabel && (
              <div className="flex items-center gap-1.5">
                <span aria-hidden>📄</span>
                <dt className="sr-only">Estado de formalización</dt>
                <dd>{formalizationLabel}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </section>
  );
}
