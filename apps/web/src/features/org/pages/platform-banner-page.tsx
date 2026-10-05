import { useEffect, useState } from 'react';
import { Role, type PlatformSettings } from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient, type ApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { IMAGE_ACCEPT, uploadFileBytes, validateUpload } from '../lib/storage';

const SLOT_COUNT = 4;

interface UploadTargetResult {
  url: string;
  key: string;
}

/** Reserve a platform-level storage target (`POST /platform/settings/uploads`,
 *  PlatformAdmin/PlatformSuperAdmin, public visibility — S-15) and PUT the
 *  real bytes to it. Returns the publicly-servable URL to store as one entry
 *  of `heroBannerPhotos`. SAME two-step flow + URL-building convention as
 *  `org-profile-form.tsx`'s `uploadProfileImage` (reserved.url is the PUT
 *  target, never the display URL — that one is built from the same key at
 *  `/storage/public`). */
async function uploadBannerPhoto(client: ApiClient, file: File): Promise<string> {
  const reserved = await client.request<UploadTargetResult>('/platform/settings/uploads', {
    method: 'POST',
    json: { filename: file.name, contentType: file.type },
  });
  await uploadFileBytes(client, reserved.key, file);
  const origin = new URL(reserved.url).origin;
  return `${origin}/storage/public?key=${encodeURIComponent(reserved.key)}`;
}

function CameraIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

interface BannerSlotProps {
  index: number;
  value: string | undefined;
  onChange: (index: number, value: string | undefined) => void;
}

function BannerSlot({ index, value, onChange }: BannerSlotProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const inputId = `hero-banner-slot-${index}`;

  const handleFile = async (file: File): Promise<void> => {
    const invalid = validateUpload(file, IMAGE_ACCEPT);
    if (invalid) {
      toast({ title: 'Imagen no válida', description: invalid, variant: 'warning' });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadBannerPhoto(client, file);
      onChange(index, url);
      toast({
        title: 'Foto subida',
        description: 'Haz clic en "Guardar cambios" para publicarla.',
        variant: 'info',
      });
    } catch (error) {
      toast({
        title: 'No se pudo subir la foto',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <img
          src={value}
          alt={`Vista previa: foto ${index + 1} del banner`}
          className="h-32 w-full rounded-lg border border-border object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground"
        >
          <CameraIcon />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          {uploading ? 'Subiendo…' : value ? 'Cambiar foto' : 'Subir foto'}
        </label>
        {value && (
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-destructive"
            onClick={() => onChange(index, undefined)}
          >
            Quitar
          </button>
        )}
      </div>
      <input
        id={inputId}
        type="file"
        accept={IMAGE_ACCEPT.join(',')}
        className="sr-only"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}

/**
 * `/plataforma/banner` (S-15 — pedido del cliente: "el administrador pueda
 * cambiar [las 4 fotos del banner inicial] por fotos de animales o lo que
 * quiera subir"). Hasta 4 fotos para el collage del portal general ("/",
 * `HeroPhotoGrid`) — un cuadro sin foto sigue mostrando el degradé/ícono
 * decorativo de siempre, nunca una caja rota. PlatformAdmin/PlatformSuperAdmin
 * (mismos roles que el resto de `/plataforma/*`).
 */
export function PlatformBannerPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canView = hasRole(Role.PlatformAdmin) || hasRole(Role.PlatformSuperAdmin);
  const { toast } = useToast();

  const [photos, setPhotos] = useState<(string | undefined)[]>(
    Array.from({ length: SLOT_COUNT }, () => undefined),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    void (async () => {
      try {
        const settings = await client.request<PlatformSettings>('/platform/settings');
        if (!active) return;
        const slots = Array.from({ length: SLOT_COUNT }, (_, i) => settings.heroBannerPhotos[i]);
        setPhotos(slots);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, canView]);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const current = await client.request<PlatformSettings>('/platform/settings');
      await client.request<PlatformSettings>('/platform/settings', {
        method: 'PUT',
        json: {
          showOrganizationType: current.showOrganizationType,
          heroBannerPhotos: photos.filter((p): p is string => Boolean(p)),
        },
      });
      toast({ title: 'Banner actualizado', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <PageContainer>
        <PageHeader title="Banner del portal" description="Acceso restringido." />
        <EmptyState title="Sin acceso" description="No tienes permisos de plataforma." />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Banner del portal"
        description="Hasta 4 fotos para el collage del portal general (adoptafacil.com/). Un cuadro sin foto muestra el diseño decorativo de siempre."
      />
      {loading && <Skeleton className="h-96 w-full" />}
      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle>Fotos del banner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {photos.map((value, index) => (
                <BannerSlot
                  key={index}
                  index={index}
                  value={value}
                  onChange={(i, next) =>
                    setPhotos((prev) => prev.map((p, pi) => (pi === i ? next : p)))
                  }
                />
              ))}
            </div>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
