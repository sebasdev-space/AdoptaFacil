import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FormalizationState,
  OrganizationType,
  Role,
  type Organization,
} from '@adoptafacil/contracts';
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
import { CompletionRing } from '../components/completion-ring';
import { OrgProfileForm } from '../components/org-profile-form';
import { useOrgProfileEditor } from '../hooks/use-org-profile-editor';
import { computeProfileCompleteness } from '../model/profile-completeness';

const PAGE_TITLE = 'Perfil de la organización';

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

/** Same enum @sebastian already owns in `org.ts`; reproduced locally (like
 *  `features/portals/components/org-type-badge.tsx` does) to avoid importing
 *  across the features/portals domain boundary for a single label map. */
const ORG_TYPE_LABELS: Record<OrganizationType, string> = {
  [OrganizationType.Foundation]: 'Fundación',
  [OrganizationType.Association]: 'Asociación',
  [OrganizationType.Corporation]: 'Corporación',
  [OrganizationType.Shelter]: 'Refugio',
  [OrganizationType.NaturalPerson]: 'Persona natural',
  [OrganizationType.Other]: 'Otro',
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

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** Non-navigating breadcrumb (S2-05 top bar) — purely contextual, matching the
 *  mock's "Configuración > Mi organización" trail. There is no real
 *  `/configuracion` route in this app, so "Configuración" is plain text, not
 *  a link (same treatment the mock itself gives it). */
function Breadcrumb() {
  return (
    <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
      Configuración
      <ChevronRightIcon />
      Mi organización
    </p>
  );
}

interface OrgTopBarActionsProps {
  org: Organization;
  canEdit: boolean;
  saving: boolean;
  onSave: () => void;
}

/**
 * Barra de acciones (S2-05, reemplaza la de 3 botones de S2-REORG): medidor de
 * completitud real + Formalización (estado real) + Personalización + Ver
 * portal público + Guardar cambios (solo si `canEdit`).
 *
 * Personalización sigue siendo SOLO un link a `/organizacion/portal` — no un
 * popover inline. Esa página (color de marca + posiciones + su propia
 * mini-preview) vive ENTERAMENTE en `features/portals` (dominio de Fabián,
 * CODEOWNERS); el inventario de este spec confirmó que ya no comparte NINGÚN
 * campo con "Mi organización" (S2-REORG movió `aboutUs`/`extendedContact`
 * fuera de Personalización hace tiempo). Cruzar ese dominio para construir un
 * popover/mini-preview embebido fue explícitamente descartado por decisión del
 * usuario — "solo enlace directo" — para no importar ni duplicar código ajeno.
 */
function OrgTopBarActions({ org, canEdit, saving, onSave }: OrgTopBarActionsProps) {
  const linkClass = buttonVariants({ variant: 'outline', size: 'sm' });
  const completeness = computeProfileCompleteness(org);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <CompletionRing
        percent={completeness.percent}
        missing={completeness.total - completeness.filled}
      />
      <div className="hidden h-8 w-px bg-border sm:block" aria-hidden />
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/organizacion/formalizacion" className={`${linkClass} gap-1.5`}>
          Formalización
          <Badge variant="secondary">
            {FORMALIZATION_LABELS[org.formalizationState ?? FormalizationState.Informal]}
          </Badge>
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
        {canEdit && (
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Compact back-office header (T-D05 P2) — logo + name + type/formalization
 *  badges, shown regardless of edit permission. */
function ProfileHeaderBanner({ org }: { org: Organization }) {
  return (
    <Card className="mb-6">
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        {org.logoUrl ? (
          <img
            src={org.logoUrl}
            alt={`Logo de ${org.name}`}
            className="h-14 w-14 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground"
          >
            {org.name ? org.name.charAt(0).toUpperCase() : '?'}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate text-lg font-semibold text-foreground">{org.name}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {org.organizationType && (
              <Badge variant="info">
                {ORG_TYPE_LABELS[org.organizationType] ?? org.organizationType}
              </Badge>
            )}
            <Badge>
              {FORMALIZATION_LABELS[org.formalizationState ?? FormalizationState.Informal]}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
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
 *  Administrator get the edit form; other members see a read-only view.
 *
 * The top bar (`<PageHeader>`) is rendered ONCE, unconditionally, in the SAME
 * JSX position for the whole component lifetime — only its `actions` prop
 * value changes as `org` loads. This is deliberate: an earlier version
 * rendered a DIFFERENT `<PageHeader>` instance once `org` finished loading
 * (nested inside a loaded-only child component), which is invisible to a
 * human but makes React unmount+remount the real DOM node during the
 * loading→loaded transition — flaky under test tooling that grabs an element
 * reference moments before that swap. `useOrgProfileEditor` accepts a
 * nullable `org` for exactly this reason: it can be called unconditionally
 * here, before the fetch resolves. */
export function OrgProfilePage() {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canEdit = hasAnyRole(Role.Owner, Role.Administrator);
  const editor = useOrgProfileEditor(org, setOrg);

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
      <Breadcrumb />
      <PageHeader
        title={PAGE_TITLE}
        description="Perfil institucional de tu organización."
        actions={
          org ? (
            <OrgTopBarActions
              org={org}
              canEdit={canEdit}
              saving={editor.saving}
              onSave={editor.handleSubmit}
            />
          ) : undefined
        }
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {error && !loading && <p className="text-sm text-destructive">{error}</p>}
      {org && !loading && (
        <>
          <ProfileHeaderBanner org={org} />
          {canEdit ? (
            <OrgProfileForm editor={editor} formalizationState={org.formalizationState} />
          ) : (
            <ReadOnlyProfile org={org} />
          )}
        </>
      )}
    </PageContainer>
  );
}
