import type { OrganizationPublic } from '@adoptafacil/contracts';
import type { PublicHeaderNavItem } from './public-header';
import {
  IconFacebook,
  IconGlobe,
  IconInstagram,
  IconMail,
  IconTikTok,
  IconWhatsapp,
} from './portal-icons';
import styles from '../styles/public-portal.module.scss';

export interface PublicFooterProps {
  organization: Pick<OrganizationPublic, 'name' | 'socialLinks' | 'whatsapp' | 'contactEmail'>;
  navItems: readonly PublicHeaderNavItem[];
}

/**
 * Pie del portal público (§M14, rediseño T-D04). Mismos anclas reales del
 * header + los mismos campos reales de redes/contacto que `PortalSocialLinks`
 * (nunca un ícono/red inventados — YouTube no aparece porque
 * `OrganizationSocialLinks` no tiene ese campo hoy). Copyright con el año
 * actual (dinámico, nunca un año fijo).
 */
export function PublicFooter({ organization, navItems }: PublicFooterProps) {
  const socialIcons: Array<{ key: string; label: string; href: string; Icon: typeof IconGlobe }> =
    [];
  if (organization.socialLinks?.instagram) {
    socialIcons.push({
      key: 'instagram',
      label: 'Instagram',
      href: organization.socialLinks.instagram,
      Icon: IconInstagram,
    });
  }
  if (organization.socialLinks?.facebook) {
    socialIcons.push({
      key: 'facebook',
      label: 'Facebook',
      href: organization.socialLinks.facebook,
      Icon: IconFacebook,
    });
  }
  if (organization.socialLinks?.tiktok) {
    socialIcons.push({
      key: 'tiktok',
      label: 'TikTok',
      href: organization.socialLinks.tiktok,
      Icon: IconTikTok,
    });
  }
  if (organization.socialLinks?.website) {
    socialIcons.push({
      key: 'website',
      label: 'Sitio web',
      href: organization.socialLinks.website,
      Icon: IconGlobe,
    });
  }
  if (organization.whatsapp) {
    socialIcons.push({
      key: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/${organization.whatsapp.replace(/[^\d]/g, '')}`,
      Icon: IconWhatsapp,
    });
  }
  if (organization.contactEmail) {
    socialIcons.push({
      key: 'email',
      label: 'Correo',
      href: `mailto:${organization.contactEmail}`,
      Icon: IconMail,
    });
  }

  return (
    <footer className={styles.footer} data-testid="public-footer">
      <div className={styles.footer__top}>
        <div className={styles.footer__brand}>
          <span className={styles.header__name}>{organization.name}</span>
        </div>
        <nav className={styles.footer__nav} aria-label="Navegación del portal (pie de página)">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className={styles.footer__navLink}>
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <div className={styles.footer__bottom}>
        <p className={styles.footer__copyright}>
          © {new Date().getFullYear()} {organization.name}. Todos los derechos reservados.
        </p>
        {socialIcons.length > 0 && (
          <div className={styles.footer__social}>
            {socialIcons.map(({ key, label, href, Icon }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className={styles.footer__socialIcon}
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
}
