import { useEffect, useMemo, useState } from 'react';
import {
  Role,
  type Organization,
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
import {
  contrastRatio,
  hexToHslString,
  hslStringToHex,
  MIN_CONTRAST_RATIO,
} from '../model/color-conversion';
import { PORTAL_THEME_FIELDS, safePortalTheme, type PortalThemeField } from '../model/theme';
import { PortalMiniPreview } from '../components/portal-mini-preview';

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
  primary: '172 67% 30%',
  'primary-foreground': '0 0% 100%',
  secondary: '213 20% 93%',
  'secondary-foreground': '214 32% 18%',
  accent: '169 55% 94%',
  'accent-foreground': '214 32% 18%',
  ring: '172 67% 30%',
};

/**
 * Pares fondo/texto (T-PORTAL-CONTRAST). Mismos pares que
 * `PORTAL_COLOR_PAIRS` en `apps/api/.../portals.schemas.ts` — duplicado aquí
 * porque es una constante de unas líneas, no un tipo compartido (no toca
 * `packages/contracts`).
 *
 * DECISIÓN DE PRODUCTO (T-PORTAL-CROSSED-INPUTS): se intentó autoajustar el
 * color emparejado cuando el contraste no alcanzaba (fondo→texto y luego
 * también texto→fondo), pero eso significaba que cambiar UN input a veces
 * recoloreaba OTRO que el usuario no tocó — confirmado que no era un bug de
 * índice (el log de `onChange`/`setToken` mostraba siempre el token correcto
 * escribiéndose), sino el autoajuste funcionando como se diseñó. El dueño del
 * producto prefirió lo contrario: cada input SOLO cambia lo que se toca,
 * nunca un campo ajeno — a costa de que "Guardar" puede volver a fallar por
 * contraste insuficiente si el usuario arma una combinación inválida. Por
 * eso `save()` valida los 3 pares ANTES de llamar al backend y muestra un
 * error claro (qué dos campos chocan y su ratio real) en vez de la
 * combinación cambiando sola o de un 400 genérico.
 */
const COLOR_PAIRS: ReadonlyArray<[string, string]> = [
  ['primary', 'primary-foreground'],
  ['secondary', 'secondary-foreground'],
  ['accent', 'accent-foreground'],
];

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
 * One color token as a COMPACT native color picker (S2-REORG: no HSL value
 * shown by default — a non-technical owner never needs to see `"142 72% 29%"`
 * to pick a color; the raw value is still one hover away via the native
 * `title` tooltip for anyone who wants it). Clicking the swatch opens the
 * browser's own color picker; the backend still only ever sees/stores the
 * bare HSL string it always did (T-D03) — only the UI changed.
 */
function ColorField({ field, value, onChange }: ColorFieldProps) {
  const inputId = `token-${field.token}`;
  const displayHsl = value || DISPLAY_FALLBACK_HSL[field.token] || '0 0% 50%';
  const hex = hslStringToHex(displayHsl);

  return (
    <div className="space-y-1" title={displayHsl}>
      <label htmlFor={inputId} className="block text-xs font-medium text-foreground">
        {field.label}
      </label>
      <input
        id={inputId}
        type="color"
        value={hex}
        onChange={(event) => onChange(hexToHslString(event.target.value))}
        className="h-10 w-full cursor-pointer rounded-md border border-input bg-background p-1"
      />
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
 * T-027). Solo lo VISUAL (S2-REORG): colores + layout + vista previa. El
 * contenido de la organización ("Nosotros", contacto extendido) se mueve a
 * "Mi organización" (`org-profile-form.tsx`) — sigue viviendo en
 * `organization_profiles` (`PUT /org/profile`), esta página nunca lo tocó a
 * nivel de backend, solo dejó de MOSTRARLO aquí. Gating deny-by-default: sólo
 * Owner/Administrador pueden editar (la autoridad real la impone el backend
 * con RolesGuard; aquí evitamos mostrar el editor a quien no tiene rol).
 * NO hay CSS libre: sólo tokens validados.
 */
export function PortalThemePage() {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  const canEdit = hasAnyRole(Role.Owner, Role.Administrator);
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>({});
  const [logoPosition, setLogoPosition] = useState<PortalLogoPosition>('left');
  const [socialNavPosition, setSocialNavPosition] = useState<PortalSocialNavPosition>('right');
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
      // Best-effort, READ-ONLY: only for the "Ver portal público" link and the
      // mini preview's org name — this page no longer WRITES to /org/profile
      // (S2-REORG; "Nosotros"/contacto viven en Mi organización ahora).
      client.request<Organization>('/org/profile').catch(() => null),
    ])
      .then(([config, org]) => {
        if (!active) return;
        setForm(safePortalTheme(config.tokens) as FormState);
        setLogoPosition(config.logoPosition ?? 'left');
        setSocialNavPosition(config.socialNavPosition ?? 'right');
        setSlug(org?.slug ?? undefined);
        setOrgName(org?.name ?? undefined);
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

  /**
   * Validación previa de contraste (T-PORTAL-CROSSED-INPUTS): decisión de
   * producto — cada input SOLO cambia lo que se toca, nunca se autoajusta un
   * campo ajeno (ver el comentario en `COLOR_PAIRS` arriba). Eso significa
   * que una combinación inválida puede llegar a "Guardar"; en vez de dejar
   * que el 400 del backend sea la primera noticia, se revisa aquí ANTES de
   * llamar a la API (mismos pares y umbral que `portals.schemas.ts`) y se
   * muestra qué dos campos exactos chocan y su ratio real — el usuario ajusta
   * el que prefiera, ninguno se mueve solo. Devuelve `null` si todo está bien.
   */
  function findContrastConflict(current: FormState): string | null {
    const labelFor = (token: string) =>
      PORTAL_THEME_FIELDS.find((field) => field.token === token)?.label ?? token;
    for (const [bgToken, fgToken] of COLOR_PAIRS) {
      const bg = current[bgToken]?.trim();
      const fg = current[fgToken]?.trim();
      if (!bg || !fg) continue; // el backend tampoco lo revisa si falta alguno de los dos.
      const ratio = contrastRatio(bg, fg);
      if (ratio === null || ratio < MIN_CONTRAST_RATIO) {
        const ratioText = ratio === null ? '?' : ratio.toFixed(2);
        return `"${labelFor(bgToken)}" y "${labelFor(fgToken)}" no tienen suficiente contraste (${ratioText}:1, mínimo ${MIN_CONTRAST_RATIO}:1). Ajusta uno de los dos.`;
      }
    }
    return null;
  }

  const save = async () => {
    const conflict = findContrastConflict(form);
    if (conflict) {
      toast({
        title: 'Revisa el contraste antes de guardar',
        description: conflict,
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const themeConfig = await client.request<PortalThemeConfig>('/portals/theme', {
        method: 'PUT',
        json: { tokens: tokensFromForm(form), logoPosition, socialNavPosition },
      });
      setForm(safePortalTheme(themeConfig.tokens) as FormState);
      setLogoPosition(themeConfig.logoPosition ?? 'left');
      setSocialNavPosition(themeConfig.socialNavPosition ?? 'right');
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

  const colorFields = PORTAL_THEME_FIELDS.filter((field) => field.kind === 'color');
  const scalarFields = PORTAL_THEME_FIELDS.filter((field) => field.kind !== 'color');

  return (
    <PageContainer>
      <PageHeader
        title="Personalización del portal"
        description="La apariencia visual de tu portal público: colores y diseño."
        actions={publicPortalLink}
      />
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Colores de tu portal</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Elige los colores que representan a tu organización. Se aplican automáticamente a
                  tu portal público.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {colorFields.map((field) => (
                    <ColorField
                      key={field.token}
                      field={field}
                      value={form[field.token] ?? ''}
                      onChange={(value) => setToken(field.token, value)}
                    />
                  ))}
                </div>
                {scalarFields.map((field) => (
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
                ))}
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
