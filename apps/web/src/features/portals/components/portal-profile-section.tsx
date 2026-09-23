import type { ReactNode } from 'react';
import { Badge, cn } from '@adoptafacil/ui';
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
 * Sección "perfil"/hero: identidad pública REAL de la organización (rediseño
 * T-D05 — banner integrado de dos columnas, texto a la izquierda y portada a
 * la derecha, en vez del cover-strip apilado + card de texto debajo de antes;
 * MISMOS props/datos/tests, solo composición). Lee directamente
 * `profile.organization` (contrato `OrganizationPublic`), por lo que hereda
 * por contrato cualquier cambio en los campos públicos que publique
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
      <div className={styles.hero2}>
        <div className={styles.hero2__grid}>
          <div className={styles.hero2__text}>
            <div className="flex flex-wrap items-center gap-2">
              <OrgTypeBadge organizationType={organizationType} />
              {formalizationLabel && (
                <Badge variant={isEsal ? 'success' : 'secondary'}>
                  {isEsal ? `✓ ${formalizationLabel}` : formalizationLabel}
                </Badge>
              )}
              {org.rteVigente && <Badge variant="success">RTE vigente</Badge>}
            </div>

            <h1 id={HEADING_ID} className={styles.name}>
              {org.name}
            </h1>

            {org.description && (
              <p className={cn('line-clamp-3', styles.description)}>{org.description}</p>
            )}

            {(location || org.nit || typeof animalCount === 'number') && (
              <p className={styles.meta}>
                {location && <span>{location}</span>}
                {location && org.nit && ' · '}
                {org.nit && (
                  <>
                    NIT: <span className="text-foreground">{org.nit}</span>
                  </>
                )}
                {(location || org.nit) && typeof animalCount === 'number' && ' · '}
                {typeof animalCount === 'number' && (
                  <span className={styles.meta__stat}>
                    {animalCount} {animalCount === 1 ? 'animal disponible' : 'animales disponibles'}
                  </span>
                )}
              </p>
            )}

            {actions}
          </div>

          <div className={styles.hero2__imageWrap}>
            {cover ? (
              <img src={cover} alt="" className={styles.hero2__image} />
            ) : (
              <div aria-hidden className={styles.hero2__imageFallback} />
            )}
            <div
              className={`${styles.hero2__logoWrap} absolute -bottom-8 z-10 ${LOGO_POSITION_CLASSES[logoPosition]}`}
            >
              {org.logoUrl ? (
                <img
                  src={org.logoUrl}
                  alt={`Logo de ${org.name}`}
                  className={styles['avatar-img']}
                />
              ) : (
                <div aria-hidden className={styles['avatar-fallback']}>
                  {initials(org.name)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
