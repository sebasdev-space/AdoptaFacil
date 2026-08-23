import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FormalizationState, Role, type Organization } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { OrgProfileForm, type OrgProfileFormHandle } from '../components/org-profile-form';
import { computeProfileCompletenessMock } from '../lib/profile-completeness';

/** Same wording as `org-formalization-page.tsx`'s STATE_LABELS (not exported
 *  there — this is a 5-entry, unlikely-to-drift copy, not worth a shared file
 *  for a demo-prep task). */
const FORMALIZATION_LABELS: Record<FormalizationState, string> = {
  [FormalizationState.Informal]: 'Informal',
  [FormalizationState.EnProceso]: 'En proceso',
  [FormalizationState.Formalizada]: 'Formalizada',
  [FormalizationState.ESAL]: 'ESAL',
  [FormalizationState.ESAL_RTE]: 'ESAL + RTE',
};

/** Simple external-link glyph (feature-local, no icon library added — same
 *  pattern as the portal-theme page's T-D03 link icon). */
function ExternalLinkIcon() {
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

/** Simple color-palette glyph for the "Personalización" action (S2-REORG,
 *  feature-local — same convention as the external-link icon above). */
function PaletteIcon() {
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
      <path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a5 5 0 0 0 5-5c0-4.4-4.5-8.5-10-8.5Z" />
      <circle cx="7.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Barra de acciones de la cabecera (S2-VISUAL-TABS): Formalización (con el
 * estado actual) y Personalización siguen siendo accesos rápidos útiles desde
 * aquí (el nuevo spec de tabs no pedía quitarlos); "Ver portal público" pasa a
 * ser outline y "Guardar cambios" (primary, provisto por el padre — solo
 * Owner/Administrator lo ven) cierra la fila como acción principal.
 */
function OrgActionBar({ org, saveButton }: { org: Organization; saveButton?: ReactNode }) {
  const linkClass = buttonVariants({ variant: 'outline', size: 'sm' });
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link to="/organizacion/formalizacion" className={`${linkClass} gap-1.5`}>
        Formalización
        <Badge variant="secondary">
          {FORMALIZATION_LABELS[org.formalizationState ?? FormalizationState.Informal]}
        </Badge>
      </Link>
      <Link to="/organizacion/representante-legal" className={`${linkClass} gap-1.5`}>
        Representante legal
      </Link>
      <Link to="/organizacion/portal" className={`${linkClass} gap-1.5`}>
        <PaletteIcon />
        Personalización
      </Link>
      {org.slug && (
        <a
          href={`/o/${encodeURIComponent(org.slug)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkClass} gap-1.5`}
        >
          Ver portal público
          <ExternalLinkIcon />
        </a>
      )}
      {saveButton}
    </div>
  );
}

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
  const [saving, setSaving] = useState(false);
  const formRef = useRef<OrgProfileFormHandle>(null);
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

  const completeness = org ? computeProfileCompletenessMock(org) : 0;

  return (
    <PageContainer>
      <PageHeader
        title="Perfil de la organización"
        description={
          org ? `Perfil ${completeness}% completo · publicado en tu portal público` : undefined
        }
        actions={
          org ? (
            <OrgActionBar
              org={org}
              saveButton={
                canEdit ? (
                  <Button onClick={() => formRef.current?.submit()} disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                ) : undefined
              }
            />
          ) : undefined
        }
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {error && !loading && <p className="text-sm text-destructive">{error}</p>}
      {org && !loading && (
        <>
          {canEdit ? (
            <OrgProfileForm
              ref={formRef}
              initial={org}
              onSaved={setOrg}
              onSavingChange={setSaving}
            />
          ) : (
            <ReadOnlyProfile org={org} />
          )}
        </>
      )}
    </PageContainer>
  );
}
