import { useEffect, useMemo, useState } from 'react';
import {
  Role,
  type Organization,
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
  const [slug, setSlug] = useState<string | undefined>(undefined);
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
      // Best-effort: the "Ver portal público" link simply stays hidden if this
      // fails or the org has no slug yet — never a fabricated/broken link.
      client.request<Organization>('/org/profile').catch(() => null),
    ])
      .then(([config, org]) => {
        if (!active) return;
        setForm(safePortalTheme(config.tokens) as FormState);
        setSlug(org?.slug ?? undefined);
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
  const accentBg = form.accent || DISPLAY_FALLBACK_HSL.accent;
  const accentFg = form['accent-foreground'] || DISPLAY_FALLBACK_HSL['accent-foreground'];
  const ringColor = form.ring || DISPLAY_FALLBACK_HSL.ring;

  const setToken = (token: string, value: string) =>
    setForm((prev) => ({ ...prev, [token]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const config = await client.request<PortalThemeConfig>('/portals/theme', {
        method: 'PUT',
        json: { tokens: tokensFromForm(form) },
      });
      setForm(safePortalTheme(config.tokens) as FormState);
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
              <div className="flex justify-end border-t pt-4">
                <Button disabled={saving} onClick={() => void save()}>
                  {saving ? 'Guardando…' : 'Guardar personalización'}
                </Button>
              </div>
            </CardContent>
          </Card>

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
        </div>
      )}
    </PageContainer>
  );
}
