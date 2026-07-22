import { useEffect, useMemo, useState } from 'react';
import { Role, type PortalTheme, type PortalThemeConfig } from '@adoptafacil/contracts';
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
import { PORTAL_THEME_FIELDS, safePortalTheme } from '../model/theme';

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

/**
 * `/organizacion/portal` — configuración de PERSONALIZACIÓN del portal (§M14,
 * T-027). El dueño define los tokens de marca (subconjunto seguro), con vista
 * previa en vivo. Gating deny-by-default: sólo Owner/Administrador pueden editar
 * (la autoridad real la impone el backend con RolesGuard; aquí evitamos mostrar
 * el editor a quien no tiene rol). NO hay CSS libre: sólo tokens validados.
 */
export function PortalThemePage() {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  const canEdit = hasAnyRole(Role.Owner, Role.Administrator);
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canEdit) {
      setLoading(false);
      return;
    }
    let active = true;
    client
      .request<PortalThemeConfig>('/portals/theme')
      .then((config) => {
        if (!active) return;
        const tokens = safePortalTheme(config.tokens);
        setForm(tokens as FormState);
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
      toast({ title: 'Personalización guardada', description: 'Tu portal se re-tematizó.' });
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

  // Deny-by-default: without Owner/Administrator the tokens are not editable.
  if (!canEdit) {
    return (
      <PageContainer>
        <PageHeader
          title="Personalización del portal"
          description="Apariencia de marca de tu organización (§M14)."
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
              {PORTAL_THEME_FIELDS.map((field) => {
                const inputId = `token-${field.token}`;
                const hintId = `${inputId}-hint`;
                return (
                  <div key={field.token} className="space-y-1.5">
                    <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
                      {field.label}
                    </label>
                    <Input
                      id={inputId}
                      value={form[field.token] ?? ''}
                      placeholder={field.kind === 'color' ? '142 72% 29%' : '0.5rem'}
                      aria-describedby={hintId}
                      onChange={(event) => setToken(field.token, event.target.value)}
                    />
                    <p id={hintId} className="text-xs text-muted-foreground">
                      {field.hint}
                    </p>
                  </div>
                );
              })}
              <div className="flex justify-end border-t pt-4">
                <Button disabled={saving} onClick={() => void save()}>
                  {saving ? 'Guardando…' : 'Guardar personalización'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Live preview — the same tokens applied to a scoped sample, so the
              owner sees the re-theme before publishing it. */}
          <Card style={previewStyle} data-testid="theme-preview">
            <CardHeader>
              <CardTitle>Vista previa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button>Botón primario</Button>
                <Button variant="outline">Contorno</Button>
                <Badge>Primario</Badge>
                <Badge variant="secondary">Secundario</Badge>
                <Badge variant="outline">Acento</Badge>
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
