import type { OrganizationExtendedContact, OrganizationLocation } from '@adoptafacil/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';
import { googleMapsEmbedFromAddress, toGoogleMapsEmbedUrl } from '../model/google-maps';

export interface PortalContactInfoSectionProps {
  contact: OrganizationExtendedContact;
  /** Ubicación general de la organización (ciudad/departamento/país) — solo para afinar la búsqueda del mapa por dirección. */
  location?: OrganizationLocation;
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
export function PortalContactInfoSection({ contact, location }: PortalContactInfoSectionProps) {
  // El mapa se ve SIN hacer clic: 1) el enlace de Google Maps cargado por la
  // organización, si se puede embeber; 2) si no (p. ej. un enlace corto de
  // "compartir") o no hay enlace, la DIRECCIÓN (+ ciudad/departamento/país reales).
  const embedUrl =
    (contact.mapUrl ? toGoogleMapsEmbedUrl(contact.mapUrl) : null) ??
    googleMapsEmbedFromAddress(
      contact.fullAddress,
      location?.city,
      location?.department,
      location?.country ?? 'Colombia',
    );

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
        {embedUrl && (
          <iframe
            title="Ubicación en el mapa"
            src={embedUrl}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            className="h-64 w-full rounded-md border border-border"
            data-testid="portal-contact-map"
          />
        )}
        {contact.mapUrl && (
          <a
            href={contact.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            {embedUrl ? 'Abrir en Google Maps →' : 'Ver en mapa →'}
          </a>
        )}
      </CardContent>
    </Card>
  );
}
