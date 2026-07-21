import { Badge, Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';
import type { PortalProfile } from '@adoptafacil/contracts';
import { OrgTypeBadge } from './org-type-badge';

export interface PortalProfileSectionProps {
  profile: PortalProfile;
}

const HEADING_ID = 'portal-profile-heading';

/**
 * Sección "perfil": identidad pública REAL de la organización. Lee directamente
 * `profile.organization` (contrato `OrganizationPublic`), por lo que hereda por
 * contrato cualquier cambio en los campos públicos que publique @sebastian — sin
 * reproyectar. Reserva además el hueco del badge de tipo de organización.
 */
export function PortalProfileSection({ profile }: PortalProfileSectionProps) {
  const { organization: org, organizationType } = profile;

  return (
    <section aria-labelledby={HEADING_ID}>
      <Card>
        <CardHeader>
          <CardTitle id={HEADING_ID} className="flex flex-wrap items-center gap-2">
            {org.name}
            <OrgTypeBadge organizationType={organizationType} />
            {org.rteVigente && <Badge variant="success">RTE vigente</Badge>}
            {org.verificationLevel && (
              <Badge variant="secondary">Verificación nivel {org.verificationLevel.level}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {org.description && <p className="text-sm text-foreground">{org.description}</p>}
          <dl className="grid gap-4 sm:grid-cols-2">
            {org.location?.city && (
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Ubicación</dt>
                <dd className="text-sm">
                  {[org.location.city, org.location.department, org.location.country]
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </div>
            )}
            {org.contactEmail && (
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Correo</dt>
                <dd className="text-sm">{org.contactEmail}</dd>
              </div>
            )}
            {org.whatsapp && (
              <div>
                <dt className="text-xs uppercase text-muted-foreground">WhatsApp</dt>
                <dd className="text-sm">{org.whatsapp}</dd>
              </div>
            )}
            {org.nit && (
              <div>
                <dt className="text-xs uppercase text-muted-foreground">NIT</dt>
                <dd className="text-sm">{org.nit}</dd>
              </div>
            )}
          </dl>
          {org.socialLinks?.website && (
            <a
              href={org.socialLinks.website}
              className="text-sm font-medium text-primary hover:underline"
              rel="noreferrer"
              target="_blank"
            >
              Sitio web
            </a>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
