import type { OrganizationExtendedContact } from '@adoptafacil/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';

export interface PortalContactInfoSectionProps {
  contact: OrganizationExtendedContact;
}

/**
 * Tab pública "Información" (S2-PORTAL): horario, dirección completa, mapa y
 * teléfonos adicionales. Renderiza SOLO los campos que el perfil real trae
 * (nunca inventados); el mapa es un iframe simple con la URL que el Owner
 * pegó — sin integración con la API de Google Maps (no hay API key).
 */
export function PortalContactInfoSection({ contact }: PortalContactInfoSectionProps) {
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
        {contact.mapUrl && (
          <iframe
            title="Ubicación en el mapa"
            src={contact.mapUrl}
            loading="lazy"
            className="h-64 w-full rounded-md border border-border"
          />
        )}
      </CardContent>
    </Card>
  );
}
