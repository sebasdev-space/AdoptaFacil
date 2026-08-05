import type { OrganizationExtendedContact } from '@adoptafacil/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';
import { toGoogleMapsEmbedUrl } from '../model/google-maps';

export interface PortalContactInfoSectionProps {
  contact: OrganizationExtendedContact;
}

/**
 * Tab pública "Información" (S2-PORTAL/S2-REORG): horario, dirección completa,
 * mapa y teléfonos adicionales. Renderiza SOLO los campos que el perfil real
 * trae (nunca inventados).
 *
 * Mapa (S2-REORG fix): una URL normal de Google Maps ("comparte esta
 * ubicación") no es embebible — el iframe respondía "refused to connect".
 * `toGoogleMapsEmbedUrl` intenta convertirla a la forma embebible; si no se
 * puede con confianza (o la URL no es de Google Maps), se muestra un enlace
 * "Ver en mapa →" en vez de un iframe roto. Sin URL, no se muestra nada.
 */
export function PortalContactInfoSection({ contact }: PortalContactInfoSectionProps) {
  const embedUrl = contact.mapUrl ? toGoogleMapsEmbedUrl(contact.mapUrl) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Información de contacto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="space-y-3">
          {contact.hours && (
            <div>
              <dt className="font-medium text-foreground">Horario de atención</dt>
              <dd className="text-muted-foreground">{contact.hours}</dd>
            </div>
          )}
          {contact.fullAddress && (
            <div>
              <dt className="font-medium text-foreground">Dirección</dt>
              <dd className="text-muted-foreground">{contact.fullAddress}</dd>
            </div>
          )}
          {contact.additionalPhones && contact.additionalPhones.length > 0 && (
            <div>
              <dt className="font-medium text-foreground">Teléfonos</dt>
              <dd className="text-muted-foreground">{contact.additionalPhones.join(' · ')}</dd>
            </div>
          )}
        </dl>
        {contact.mapUrl &&
          (embedUrl ? (
            <iframe
              title="Ubicación en el mapa"
              src={embedUrl}
              loading="lazy"
              className="h-64 w-full rounded-md border border-border"
            />
          ) : (
            <a
              href={contact.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Ver en mapa →
            </a>
          ))}
      </CardContent>
    </Card>
  );
}
