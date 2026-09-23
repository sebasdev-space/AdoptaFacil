import type { ComponentType } from 'react';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { Card, CardContent, CardHeader, CardTitle, cn } from '@adoptafacil/ui';
import {
  IconArrowRight,
  IconFacebook,
  IconGlobe,
  IconInstagram,
  IconMail,
  IconTikTok,
  IconWhatsapp,
  type IconProps,
} from './portal-icons';
import styles from '../styles/public-portal.module.scss';

export interface PortalSocialLinksProps {
  organization: Pick<OrganizationPublic, 'socialLinks' | 'whatsapp' | 'contactEmail'>;
}

const SOCIAL_META: Record<
  'instagram' | 'facebook' | 'tiktok' | 'website',
  { label: string; Icon: ComponentType<IconProps> }
> = {
  instagram: { label: 'Instagram', Icon: IconInstagram },
  facebook: { label: 'Facebook', Icon: IconFacebook },
  tiktok: { label: 'TikTok', Icon: IconTikTok },
  website: { label: 'Sitio web', Icon: IconGlobe },
};

/**
 * Sidebar del portal público (§M14, pulido visual T-D02): redes sociales + contacto.
 * Renderiza SOLO lo que el `OrganizationPublic` real trae — nunca campos vacíos ni
 * inventados. Si ninguna red/contacto tiene valor, la sección entera se omite.
 */
export function PortalSocialLinks({ organization }: PortalSocialLinksProps) {
  const socialEntries = (['instagram', 'facebook', 'tiktok', 'website'] as const).flatMap((key) => {
    const url = organization.socialLinks?.[key];
    return url ? [{ key, url, ...SOCIAL_META[key] }] : [];
  });

  const whatsappHref = organization.whatsapp
    ? `https://wa.me/${organization.whatsapp.replace(/[^\d]/g, '')}`
    : undefined;

  const hasAnything = socialEntries.length > 0 || whatsappHref || organization.contactEmail;
  if (!hasAnything) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Síguenos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Conoce más de nuestro trabajo y acompáñanos en redes sociales.
        </p>
      </CardHeader>
      <CardContent>
        <ul className={styles.socialList}>
          {socialEntries.map(({ key, label, url, Icon }) => (
            <li key={key}>
              <a href={url} target="_blank" rel="noopener noreferrer" className={styles.socialRow}>
                <span aria-hidden className={styles.socialRow__icon}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className={styles.socialRow__label}>{label}</span>
                <IconArrowRight aria-hidden className={cn('h-4 w-4', styles.socialRow__arrow)} />
              </a>
            </li>
          ))}
          {whatsappHref && (
            <li>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.socialRow}
              >
                <span aria-hidden className={styles.socialRow__icon}>
                  <IconWhatsapp className="h-4 w-4" />
                </span>
                <span className={styles.socialRow__label}>WhatsApp</span>
                <IconArrowRight aria-hidden className={cn('h-4 w-4', styles.socialRow__arrow)} />
              </a>
            </li>
          )}
          {organization.contactEmail && (
            <li>
              <a href={`mailto:${organization.contactEmail}`} className={styles.socialRow}>
                <span aria-hidden className={styles.socialRow__icon}>
                  <IconMail className="h-4 w-4" />
                </span>
                <span className={styles.socialRow__label}>{organization.contactEmail}</span>
                <IconArrowRight aria-hidden className={cn('h-4 w-4', styles.socialRow__arrow)} />
              </a>
            </li>
          )}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Cada like, comentario y compartir nos ayuda a llegar a más personas que pueden cambiar una
          vida.
        </p>
      </CardContent>
    </Card>
  );
}
