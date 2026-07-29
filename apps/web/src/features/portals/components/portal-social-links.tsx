import type { OrganizationPublic } from '@adoptafacil/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';

export interface PortalSocialLinksProps {
  organization: Pick<OrganizationPublic, 'socialLinks' | 'whatsapp' | 'contactEmail'>;
}

/** Ícono de enlace externo genérico (sin depender de una librería de marcas). */
function LinkIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 14 21 3" />
      <path d="M15 3h6v6" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

const SOCIAL_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  website: 'Sitio web',
} as const;

/**
 * Sidebar del portal público (§M14, pulido visual T-D02): redes sociales + contacto.
 * Renderiza SOLO lo que el `OrganizationPublic` real trae — nunca campos vacíos ni
 * inventados. Si ninguna red/contacto tiene valor, la sección entera se omite.
 */
export function PortalSocialLinks({ organization }: PortalSocialLinksProps) {
  const socialEntries = (['instagram', 'facebook', 'tiktok', 'website'] as const).flatMap((key) => {
    const url = organization.socialLinks?.[key];
    return url ? [{ key, label: SOCIAL_LABELS[key], url }] : [];
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
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {socialEntries.map(({ key, label, url }) => (
            <li key={key}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <LinkIcon />
                {label}
              </a>
            </li>
          ))}
          {whatsappHref && (
            <li>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <LinkIcon />
                WhatsApp
              </a>
            </li>
          )}
          {organization.contactEmail && (
            <li>
              <a
                href={`mailto:${organization.contactEmail}`}
                className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <LinkIcon />
                {organization.contactEmail}
              </a>
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
