import type { ReactNode } from 'react';
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
  /** Acciones principales (Donar/Adoptar/Apadrinar) — pulido visual 2da
   *  iteración: viven junto al nombre/badges, no como barra suelta aparte. */
  actions?: ReactNode;
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
  actions,
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
        {/* Hero: portada navy. El avatar vive en un wrapper HERMANO (relative,
            sin overflow) — el `.hero` de abajo SÍ tiene `overflow: hidden`
            (recorta la portada), así que el avatar NO puede ser hijo suyo o
            su mitad inferior queda cortada por ese mismo overflow (bug
            corregido en la 2da iteración del pulido visual). */}
        <div className="relative">
          <div className={styles.hero}>
            {cover ? (
              <img src={cover} alt="" className={styles.hero__cover} />
            ) : (
              <div aria-hidden className={styles.hero__glow} />
            )}
          </div>
          <div className={`absolute -bottom-10 z-10 ${LOGO_POSITION_CLASSES[logoPosition]}`}>
            {org.logoUrl ? (
              <img src={org.logoUrl} alt={`Logo de ${org.name}`} className={styles['avatar-img']} />
            ) : (
              <div aria-hidden className={styles['avatar-fallback']}>
                {initials(org.name)}
              </div>
            )}
          </div>
        </div>

        <CardHeader className="gap-3 pt-12 sm:pt-14">
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

          {/* Segunda línea del header: ubicación/NIT a la izquierda, acciones
              principales (Donar/Adoptar/Apadrinar) a la derecha, mismo
              renglón — 3ra iteración del pulido visual. En mobile se apilan
              en columna (no "ml-auto" + "flex-shrink-0": esa combinación le
              da a las acciones su ancho de contenido COMPLETO sin permitir
              que su propio flex-wrap interno reaccione, y los 3 botones se
              recortaban por el `overflow-hidden` de la Card en vez de
              apilarse — bug real encontrado en QA visual mobile). */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            {(location || org.nit) && (
              <p className={styles.meta}>
                {location && <span>{location}</span>}
                {location && org.nit && ' · '}
                {org.nit && (
                  <>
                    NIT: <span className="text-foreground">{org.nit}</span>
                  </>
                )}
              </p>
            )}
            {actions}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* KPI(s) reales, integrados en el MISMO panel del header (3ra
              iteración) — ya no una tarjeta flotante aparte. Hoy solo
              "Animales disponibles" es real (ver PortalKpis, eliminado);
              cualquier otra métrica de la lista de M01 se agregaría aquí
              mismo cuando el backend la exponga. */}
          {typeof animalCount === 'number' && (
            <div className={styles.kpis}>
              <div>
                <p className={styles.kpi__value}>{animalCount}</p>
                <p className={styles.kpi__label}>
                  {animalCount === 1 ? 'animal disponible' : 'animales disponibles'}
                </p>
              </div>
            </div>
          )}
          {org.description && (
            <p className={cn('line-clamp-4', styles.description)}>{org.description}</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
