import { useEffect, useMemo, useState } from 'react';
import {
  Role,
  type Organization,
  type OrganizationExtendedContact,
  type PortalLogoPosition,
  type PortalSocialNavPosition,
  type PortalTheme,
  type PortalThemeConfig,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { brandTokensToStyle } from '../../../shell/theme';
import { hexToHslString, hslStringToHex } from '../model/color-conversion';
import { PORTAL_THEME_FIELDS, safePortalTheme, type PortalThemeField } from '../model/theme';
import { PortalMiniPreview } from '../components/portal-mini-preview';

const ABOUT_US_MAX = 2000;

/** "a, b\nc" → ["a", "b", "c"] — separadas por coma O por línea, vacías descartadas. */
function parsePhones(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((phone) => phone.trim())
    .filter(Boolean);
}

interface ContentFormState {
  aboutUs: string;
  hours: string;
  fullAddress: string;
  mapUrl: string;
  additionalPhones: string;
}

const EMPTY_CONTENT: ContentFormState = {
  aboutUs: '',
  hours: '',
  fullAddress: '',
  mapUrl: '',
  additionalPhones: '',
};

function contentFromOrganization(org: Organization | null | undefined): ContentFormState {
  const contact = org?.extendedContact;
  return {
    aboutUs: org?.aboutUs ?? '',
    hours: contact?.hours ?? '',
    fullAddress: contact?.fullAddress ?? '',
    mapUrl: contact?.mapUrl ?? '',
    additionalPhones: contact?.additionalPhones?.join(', ') ?? '',
  };
}

/** `undefined` cuando TODOS los campos están vacíos — nunca se manda un objeto
 *  vacío que borraría un extendedContact ya guardado por accidente de forma. */
function extendedContactFromForm(
  content: ContentFormState,
): OrganizationExtendedContact | undefined {
  const additionalPhones = parsePhones(content.additionalPhones);
  const out: OrganizationExtendedContact = {
    ...(content.hours.trim() ? { hours: content.hours.trim() } : {}),
    ...(content.fullAddress.trim() ? { fullAddress: content.fullAddress.trim() } : {}),
    ...(content.mapUrl.trim() ? { mapUrl: content.mapUrl.trim() } : {}),
    ...(additionalPhones.length > 0 ? { additionalPhones } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Empty string ⇒ "use the default token" (the field is omitted from the payload). */
type FormState = Partial<Record<string, string>>;

function tokensFromForm(form: FormState): PortalTheme {
  const raw: Record<string, string> = {};
  for (const field of PORTAL_THEME_FIELDS) {
    const value = form[field.token]?.trim();
    if (value) raw[field.token] = value;
  }
  return safePortalTheme(raw);
}

/** Real light-theme defaults (packages/ui/src/styles/globals.css) — used ONLY so
 *  the picker/swatch show a sensible color while a field is still unset; never
 *  written into the form/save payload (an unset field stays omitted, exactly
 *  as before). */
const DISPLAY_FALLBACK_HSL: Partial<Record<string, string>> = {
  primary: '142 72% 29%',
  'primary-foreground': '0 0% 100%',
  secondary: '36 38% 94%',
  'secondary-foreground': '30 25% 22%',
  accent: '142 40% 94%',
  'accent-foreground': '142 72% 20%',
  ring: '142 72% 29%',
};

/** Simple external-link glyph (feature-local — no icon library added). */
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

interface ColorFieldProps {
  field: PortalThemeField;
  value: string;
  onChange: (value: string) => void;
}

/**
 * One color token as a native color picker (T-D03) — `<input type="color">`
 * needs no dependency and works in every evergreen browser. The backend only
 * ever sees/stores the BARE HSL string (unchanged format); hex is a UI-only
 * detour. The raw HSL stays visible/editable below for advanced users.
 */
function ColorField({ field, value, onChange }: ColorFieldProps) {
  const inputId = `token-${field.token}`;
  const hintId = `${inputId}-hint`;
  const displayHsl = value || DISPLAY_FALLBACK_HSL[field.token] || '0 0% 50%';
  const hex = hslStringToHex(displayHsl);

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
        {field.label}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={`Selector de color: ${field.label}`}
          value={hex}
          onChange={(event) => onChange(hexToHslString(event.target.value))}
          className="h-10 w-14 cursor-pointer rounded border border-input bg-background p-1"
        />
        <div
          aria-hidden
          className="h-8 w-8 shrink-0 rounded border border-border"
          style={{ backgroundColor: `hsl(${displayHsl})` }}
        />
        <Input
          id={inputId}
          value={value}
          placeholder={displayHsl}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.value)}
          className="text-xs text-muted-foreground"
        />
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {field.hint}
      </p>
    </div>
  );
}

/** Mini-diagrama: una barra ("hero") con un punto marcando dónde cae el logo. */
function PositionDiagram({ dotClass }: { dotClass: string }) {
  return (
    <div aria-hidden className="relative h-5 w-full rounded bg-muted">
      <span
        className={`absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary ${dotClass}`}
      />
    </div>
  );
}

interface PositionToggleProps<T extends string> {
  legend: string;
  options: ReadonlyArray<{ value: T; label: string; dotClass: string }>;
  value: T;
  onChange: (value: T) => void;
}

/** Fila de botones toggle con mini-diagrama (S2-PORTAL) — usado para la
 *  posición del logo (3 opciones) y del sidebar de redes (2 opciones). Cambia
 *  solo el state del formulario; no guarda hasta pulsar "Guardar". */
function PositionToggle<T extends string>({
  legend,
  options,
  value,
  onChange,
}: PositionToggleProps<T>) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="block text-sm font-medium text-foreground">{legend}</legend>
      <div className={`grid gap-2 ${options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`space-y-1 rounded-md border p-2 text-xs transition-colors ${
              value === option.value
                ? 'border-primary bg-primary/5 font-medium text-foreground'
                : 'border-input text-muted-foreground hover:bg-muted'
            }`}
          >
            <PositionDiagram dotClass={option.dotClass} />
            <span className="block text-center">{option.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const LOGO_POSITION_OPTIONS = [
  { value: 'left' as const, label: 'Izquierda', dotClass: 'left-1' },
  { value: 'center' as const, label: 'Centro', dotClass: 'left-1/2 -translate-x-1/2' },
  { value: 'right' as const, label: 'Derecha', dotClass: 'right-1' },
];

const SOCIAL_NAV_POSITION_OPTIONS = [
  { value: 'left' as const, label: 'Izquierda', dotClass: 'left-1' },
  { value: 'right' as const, label: 'Derecha', dotClass: 'right-1' },
];

/**
 * `/organizacion/portal` — configuración de PERSONALIZACIÓN del portal (§M14,
 * T-027). El dueño define los tokens de marca (subconjunto seguro), con vista
 * previa en vivo. Gating deny-by-default: sólo Owner/Administrador pueden editar
 * (la autoridad real la impone el backend con RolesGuard; aquí evitamos mostrar
 * el editor a quien no tiene rol). NO hay CSS libre: sólo tokens validados.
 *
 * Pulido UX (T-D03): color pickers nativos (`<input type="color">`) en vez de
 * texto HSL crudo, vista previa realmente conectada al color de acento (antes
 * mostraba un badge "Acento" con `variant="outline"`, que NUNCA usaba
 * `--accent`/`--accent-foreground`), y un enlace directo al portal público real
 * de la organización.
 */
export function PortalThemePage() {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  const canEdit = hasAnyRole(Role.Owner, Role.Administrator);
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>({});
  const [logoPosition, setLogoPosition] = useState<PortalLogoPosition>('left');
  const [socialNavPosition, setSocialNavPosition] = useState<PortalSocialNavPosition>('right');
  const [content, setContent] = useState<ContentFormState>(EMPTY_CONTENT);
  const [slug, setSlug] = useState<string | undefined>(undefined);
  const [orgName, setOrgName] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canEdit) {
      setLoading(false);
      return;
    }
    let active = true;
    Promise.all([
      client.request<PortalThemeConfig>('/portals/theme'),
      // Best-effort: the org profile (slug + "Nosotros"/contacto extendido)
      // simply stays empty if this fails — the editor still works either way.
      client.request<Organization>('/org/profile').catch(() => null),
    ])
      .then(([config, org]) => {
        if (!active) return;
        setForm(safePortalTheme(config.tokens) as FormState);
        setLogoPosition(config.logoPosition ?? 'left');
        setSocialNavPosition(config.socialNavPosition ?? 'right');
        setSlug(org?.slug ?? undefined);
        setOrgName(org?.name ?? undefined);
        setContent(contentFromOrganization(org));
      })
      .catch(() => {
        // Leave the form empty; the org simply has no theme yet (or a transient
        // read error) — the editor still works and the preview shows defaults.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, canEdit]);

  const previewStyle = useMemo(() => brandTokensToStyle(tokensFromForm(form)), [form]);
  const primaryBg = form.primary || DISPLAY_FALLBACK_HSL.primary;
  const primaryFg = form['primary-foreground'] || DISPLAY_FALLBACK_HSL['primary-foreground'];
  const secondaryBg = form.secondary || DISPLAY_FALLBACK_HSL.secondary;
  const accentBg = form.accent || DISPLAY_FALLBACK_HSL.accent;
  const accentFg = form['accent-foreground'] || DISPLAY_FALLBACK_HSL['accent-foreground'];
  const ringColor = form.ring || DISPLAY_FALLBACK_HSL.ring;

  const setToken = (token: string, value: string) =>
    setForm((prev) => ({ ...prev, [token]: value }));
  const setContentField = <K extends keyof ContentFormState>(key: K, value: string) =>
    setContent((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const [themeConfig, org] = await Promise.all([
        client.request<PortalThemeConfig>('/portals/theme', {
          method: 'PUT',
          json: { tokens: tokensFromForm(form), logoPosition, socialNavPosition },
        }),
        client.request<Organization>('/org/profile', {
          method: 'PUT',
          json: {
            aboutUs: content.aboutUs.trim() || undefined,
            extendedContact: extendedContactFromForm(content),
          },
        }),
      ]);
      setForm(safePortalTheme(themeConfig.tokens) as FormState);
      setLogoPosition(themeConfig.logoPosition ?? 'left');
      setSocialNavPosition(themeConfig.socialNavPosition ?? 'right');
      setContent(contentFromOrganization(org));
      toast({
        title: 'Personalización guardada',
        description: 'Tu portal se re-tematizó.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description:
          error instanceof Error
            ? error.message
            : 'Revisa los valores (color/contraste) e inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const publicPortalLink = slug ? (
    <a
      href={`/o/${encodeURIComponent(slug)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      <ExternalLinkIcon />
      Ver portal público
    </a>
  ) : undefined;

  // Deny-by-default: without Owner/Administrator the tokens are not editable.
  if (!canEdit) {
    return (
      <PageContainer>
        <PageHeader
          title="Personalización del portal"
          description="Apariencia de marca de tu organización."
        />
        <EmptyState
          title="No tienes permiso para editar la personalización"
          description="Solo el propietario o un administrador de la organización puede cambiar los tokens de marca."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Personalización del portal"
        description="Define los colores de marca de tu portal público. Solo tokens seguros (sin CSS libre); se valida formato y contraste."
        actions={publicPortalLink}
      />
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tokens de marca</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {PORTAL_THEME_FIELDS.map((field) =>
                  field.kind === 'color' ? (
                    <ColorField
                      key={field.token}
                      field={field}
                      value={form[field.token] ?? ''}
                      onChange={(value) => setToken(field.token, value)}
                    />
                  ) : (
                    <div key={field.token} className="space-y-1.5">
                      <label
                        htmlFor={`token-${field.token}`}
                        className="block text-sm font-medium text-foreground"
                      >
                        {field.label}
                      </label>
                      <Input
                        id={`token-${field.token}`}
                        value={form[field.token] ?? ''}
                        placeholder="0.5rem"
                        aria-describedby={`token-${field.token}-hint`}
                        onChange={(event) => setToken(field.token, event.target.value)}
                      />
                      <p id={`token-${field.token}-hint`} className="text-xs text-muted-foreground">
                        {field.hint}
                      </p>
                    </div>
                  ),
                )}
              </CardContent>
            </Card>

            {/* Diseño del portal (S2-PORTAL): posiciones de layout, un
                subconjunto seguro y acotado más — nunca CSS libre. */}
            <Card>
              <CardHeader>
                <CardTitle>Diseño del portal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <PositionToggle
                  legend="Posición del logo"
                  options={LOGO_POSITION_OPTIONS}
                  value={logoPosition}
                  onChange={setLogoPosition}
                />
                <PositionToggle
                  legend="Posición del sidebar de redes"
                  options={SOCIAL_NAV_POSITION_OPTIONS}
                  value={socialNavPosition}
                  onChange={setSocialNavPosition}
                />
              </CardContent>
            </Card>

            {/* Sección: Nosotros / Acerca de (S2-PORTAL) — contenido de la tab
                pública "Nosotros"; se oculta en el portal si queda vacío. */}
            <Card>
              <CardHeader>
                <CardTitle>Sección: Nosotros / Acerca de</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <label htmlFor="about-us" className="block text-sm font-medium text-foreground">
                  Quiénes somos
                </label>
                <textarea
                  id="about-us"
                  value={content.aboutUs}
                  maxLength={ABOUT_US_MAX}
                  placeholder="Cuéntale al mundo quiénes son, su historia, su misión y por qué hacen lo que hacen..."
                  onChange={(event) => setContentField('aboutUs', event.target.value)}
                  className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-right text-xs text-muted-foreground">
                  {content.aboutUs.length}/{ABOUT_US_MAX}
                </p>
              </CardContent>
            </Card>

            {/* Sección: Información de contacto (S2-PORTAL) — contenido de la
                tab pública "Información"; se oculta en el portal si queda vacía. */}
            <Card>
              <CardHeader>
                <CardTitle>Sección: Información de contacto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="contact-hours"
                    className="block text-sm font-medium text-foreground"
                  >
                    Horario de atención
                  </label>
                  <Input
                    id="contact-hours"
                    value={content.hours}
                    placeholder="Lun-Vie 9:00am - 5:00pm"
                    onChange={(event) => setContentField('hours', event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="contact-address"
                    className="block text-sm font-medium text-foreground"
                  >
                    Dirección completa
                  </label>
                  <Input
                    id="contact-address"
                    value={content.fullAddress}
                    placeholder="Calle 45 #12-34, Bogotá"
                    onChange={(event) => setContentField('fullAddress', event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="contact-map"
                    className="block text-sm font-medium text-foreground"
                  >
                    Enlace a Google Maps
                  </label>
                  <Input
                    id="contact-map"
                    type="url"
                    value={content.mapUrl}
                    placeholder="https://maps.google.com/..."
                    onChange={(event) => setContentField('mapUrl', event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="contact-phones"
                    className="block text-sm font-medium text-foreground"
                  >
                    Teléfonos adicionales
                  </label>
                  <Input
                    id="contact-phones"
                    value={content.additionalPhones}
                    placeholder="3001234567, 3007654321"
                    aria-describedby="contact-phones-hint"
                    onChange={(event) => setContentField('additionalPhones', event.target.value)}
                  />
                  <p id="contact-phones-hint" className="text-xs text-muted-foreground">
                    Separados por coma o uno por línea.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? 'Guardando…' : 'Guardar personalización'}
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            {/* Live preview — the same tokens applied to a scoped sample, so the
                owner sees the re-theme before publishing it. Primary/Secondary
                cascade correctly through the shared Button/Badge variants; Acento
                and Anillo de foco get a DEDICATED swatch below (T-D03) because no
                shadcn variant in packages/ui consumes --accent/--ring at all — the
                old "Acento" badge (variant="outline") never reflected that color. */}
            <Card style={previewStyle} data-testid="theme-preview">
              <CardHeader>
                <CardTitle>Vista previa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button>Botón primario</Button>
                  <Button variant="outline">Contorno</Button>
                  <Badge>Primario</Badge>
                  <Badge variant="secondary">Secundario</Badge>
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `hsl(${accentBg})`, color: `hsl(${accentFg})` }}
                  >
                    Acento
                  </span>
                  <span
                    aria-hidden
                    title="Anillo de foco"
                    className="inline-block h-6 w-6 rounded-full border-2 bg-background"
                    style={{ borderColor: `hsl(${ringColor})` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Así se verán los elementos de marca en tu portal público.
                </p>
              </CardContent>
            </Card>

            {/* Mini-réplica del portal (S2-PORTAL) — sin fetch, refleja el
                formulario en tiempo real (colores + posiciones). */}
            <Card>
              <CardHeader>
                <CardTitle>Así se verá tu portal</CardTitle>
              </CardHeader>
              <CardContent>
                <PortalMiniPreview
                  organizationName={orgName}
                  primary={primaryBg}
                  primaryForeground={primaryFg}
                  secondary={secondaryBg}
                  accent={accentBg}
                  accentForeground={accentFg}
                  logoPosition={logoPosition}
                  socialNavPosition={socialNavPosition}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
