import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Role, type Organization } from '@adoptafacil/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { OrgProfileForm } from '../components/org-profile-form';

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

/** Read-only view for members without edit authority. */
function ReadOnlyProfile({ org }: { org: Organization }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {org.name}
          <Badge>{org.formalizationState ?? 'informal'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Row label="NIT" value={org.nit} />
          <Row label="Razón social" value={org.legalName} />
          <Row label="Ciudad" value={org.location?.city} />
          <Row label="Correo" value={org.contactEmail} />
          <Row label="WhatsApp" value={org.whatsapp} />
          <Row label="Portal" value={org.slug ? `/o/${org.slug}` : undefined} />
          <div className="sm:col-span-2">
            <Row label="Descripción" value={org.description} />
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/** Authenticated `/organizacion` page: the caller's org profile. Owner and
 *  Administrator get the edit form; other members see a read-only view. */
export function OrgProfilePage() {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canEdit = hasAnyRole(Role.Owner, Role.Administrator);

  useEffect(() => {
    let active = true;
    client
      .request<Organization>('/org/profile')
      .then((data) => {
        if (active) {
          setOrg(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el perfil.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [client]);

  return (
    <PageContainer>
      <PageHeader
        title="Mi organización"
        description="Perfil institucional de tu organización (M01)."
        actions={
          <Link
            to="/organizacion/formalizacion"
            className="text-sm font-medium text-primary hover:underline"
          >
            Formalización →
          </Link>
        }
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {error && !loading && <p className="text-sm text-destructive">{error}</p>}
      {org &&
        !loading &&
        (canEdit ? (
          <OrgProfileForm initial={org} onSaved={setOrg} />
        ) : (
          <ReadOnlyProfile org={org} />
        ))}
    </PageContainer>
  );
}
