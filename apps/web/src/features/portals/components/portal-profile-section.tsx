import { Badge, Card, CardContent, CardHeader, cn } from '@adoptafacil/ui';
import {
  FormalizationState,
  type PortalLogoPosition,
  type PortalProfile,
} from '@adoptafacil/contracts';
import { OrgTypeBadge } from './org-type-badge';
import styles from './portal-profile-section.module.scss';

export interface PortalProfileSectionProps {
  profile: PortalProfile;
  /** Total de animales adoptables (conteo real del catálogo público), si ya cargó. */
  animalCount?: number;
  /** Posición del logo sobre el hero (S2-PORTAL). Default: 'left' (como antes). */
  logoPosition?: PortalLogoPosition;
}

const HEADING_ID = 'portal-profile-heading';

/** Clases de posicionamiento del logo circular sobre el borde del cover. */
const LOGO_POSITION_CLASSES: Record<PortalLogoPosition, string> = {
  left: 'left-6',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-6',
};

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
 * T-D02, reestilado BEM+SCSS en REFACTOR-VISUAL v2 Fase 6) — hero navy con
 * portada opcional + logo, nombre, badges de tipo/formalización, y una fila
 * de stats reales (ubicación, animales disponibles, formalización). Lee
 * directamente `profile.organization` (contrato `OrganizationPublic`), por lo que
 * hereda por contrato cualquier cambio en los campos públicos que publique
 * @sebastian — sin reproyectar. El nivel de verificación NUNCA se muestra aquí
 * (siempre 0 hasta que exista el catálogo, T-103) y las redes sociales/contacto
 * viven en el sidebar (`PortalSocialLinks`), no en esta card.
 */
export function PortalProfileSection({
  profile,
  animalCount,
  logoPosition = 'left',
}: PortalProfileSectionProps) {
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
        {/* Hero: portada navy + logo circular sobre el borde inferior. */}
        <div className={cn('relative', styles.hero)}>
          {cover ? (
            <img src={cover} alt="" className={styles.hero__cover} />
          ) : (
            <div aria-hidden className={styles.hero__glow} />
          )}
          <div className={`absolute -bottom-10 ${LOGO_POSITION_CLASSES[logoPosition]}`}>
            {org.logoUrl ? (
              <img src={org.logoUrl} alt={`Logo de ${org.name}`} className={styles['avatar-img']} />
            ) : (
              <div aria-hidden className={styles['avatar-fallback']}>
                {initials(org.name)}
              </div>
            )}
          </div>
        </div>

        <CardHeader className="gap-2 pt-12 sm:pt-14">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id={HEADING_ID} className={styles.name}>
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
            <p className={styles.nit}>
              NIT: <span className="text-foreground">{org.nit}</span>
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {org.description && (
            <p className={cn('line-clamp-4', styles.description)}>{org.description}</p>
          )}
          <dl className={styles.stats}>
            {location && (
              <div className={styles.stats__item}>
                <span aria-hidden>📍</span>
                <dt className="sr-only">Ubicación</dt>
                <dd>{location}</dd>
              </div>
            )}
            {typeof animalCount === 'number' && (
              <div className={styles.stats__item}>
                <span aria-hidden>🐾</span>
                <dt className="sr-only">Animales disponibles</dt>
                <dd>
                  {animalCount} {animalCount === 1 ? 'animal disponible' : 'animales disponibles'}
                </dd>
              </div>
            )}
            {formalizationLabel && (
              <div className={styles.stats__item}>
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
