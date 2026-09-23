import type { OrganizationPublic } from '@adoptafacil/contracts';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { buildDonateHref } from './portal-donate-cta';
import { IconGift } from './portal-icons';
import styles from '../styles/public-portal.module.scss';

export interface PortalHelpCtaProps {
  organization: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location'>;
}

const HEADING_ID = 'portal-help-cta-heading';

/**
 * Banner de invitación a donar (§M14, rediseño T-D04) — ancla real del ítem de
 * navegación "Cómo ayudar". Copy genérico de invitación (sin cifras ni
 * afirmaciones específicas de la organización, nada fabricado); el único dato
 * real es el enlace, que reutiliza `buildDonateHref` TAL CUAL.
 */
export function PortalHelpCta({ organization }: PortalHelpCtaProps) {
  return (
    <section aria-labelledby={HEADING_ID} id="portal-help-cta" style={{ scrollMarginTop: '5rem' }}>
      <div className={styles.ctaBanner}>
        <div>
          <h2 id={HEADING_ID} className={styles.ctaBanner__title}>
            Pequeñas acciones, grandes cambios
          </h2>
          <p className={styles.ctaBanner__text}>
            Tu apoyo nos permite seguir rescatando, cuidando y encontrando hogares para más
            animales.
          </p>
        </div>
        <a
          href={buildDonateHref(organization)}
          className={cn(buttonVariants({ size: 'lg' }))}
          data-testid="portal-help-cta-donate"
        >
          <IconGift className="mr-1.5 h-4 w-4" />
          Quiero donar
        </a>
      </div>
    </section>
  );
}
