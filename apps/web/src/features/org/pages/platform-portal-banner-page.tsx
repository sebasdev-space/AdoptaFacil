import { useCallback, useEffect, useState } from 'react';
import {
  PORTAL_BANNER_MAX_PHOTOS,
  Role,
  type PortalBannerPhoto,
  type PortalBannerUploadTarget,
} from '@adoptafacil/contracts';
import { Badge, Button, Card, CardContent, EmptyState, Skeleton, useToast } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { uploadFileBytes, validateUpload } from '../lib/storage';
import { TextField } from '../components/profile-fields';
import styles from './platform-portal-banner-page.module.scss';

const BANNER_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'] as const;
const BANNER_MAX_MB = 5;

/**
 * `/plataforma/banner` — administra las fotos del banner (hero) del portal
 * general `/` (M14). Solo PlatformAdmin/PlatformSuperAdmin. Hasta 4 fotos, con
 * texto alternativo OBLIGATORIO; reordenar, activar/desactivar y eliminar. Sin
 * fotos activas el portal muestra su diseño por defecto (íconos).
 */
export function PlatformPortalBannerPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.PlatformAdmin) || hasRole(Role.PlatformSuperAdmin);
  const { toast } = useToast();

  const [photos, setPhotos] = useState<PortalBannerPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [alts, setAlts] = useState<Record<string, string>>({});

  const load = useCallback(async (): Promise<void> => {
    const items = await client.request<PortalBannerPhoto[]>('/platform/portal-banner');
    setPhotos(items);
    setAlts(Object.fromEntries(items.map((p) => [p.id, p.altText])));
  }, [client]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await load();
      } catch {
        if (active) toast({ title: 'No se pudo cargar el banner', variant: 'destructive' });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const run = async (action: () => Promise<void>, okTitle: string): Promise<void> => {
    setBusy(true);
    try {
      await action();
      await load();
      toast({ title: okTitle });
    } catch (error) {
      toast({
        title: 'No se pudo completar la acción',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const upload = (): Promise<void> => {
    if (!file) return Promise.resolve();
    const problem = validateUpload(file, BANNER_ACCEPT, BANNER_MAX_MB);
    if (problem) {
      toast({ title: 'Archivo no válido', description: problem, variant: 'warning' });
      return Promise.resolve();
    }
    if (!altText.trim()) {
      toast({
        title: 'Texto alternativo requerido',
        description: 'Describe la foto para personas con lector de pantalla.',
        variant: 'warning',
      });
      return Promise.resolve();
    }
    return run(async () => {
      const target = await client.request<PortalBannerUploadTarget>(
        '/platform/portal-banner/upload-target',
        { method: 'POST', json: { filename: file.name, contentType: file.type } },
      );
      await uploadFileBytes(client, target.key, file);
      await client.request('/platform/portal-banner', {
        method: 'POST',
        json: { storageKey: target.key, altText: altText.trim() },
      });
      setFile(null);
      setAltText('');
    }, 'Foto agregada');
  };

  const move = (index: number, delta: -1 | 1): Promise<void> => {
    const ids = photos.map((p) => p.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return Promise.resolve();
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return run(async () => {
      await client.request('/platform/portal-banner/order', { method: 'PUT', json: { ids } });
    }, 'Orden actualizado');
  };

  const patch = (id: string, json: { altText?: string; isActive?: boolean }, ok: string) =>
    run(async () => {
      await client.request(`/platform/portal-banner/${id}`, { method: 'PATCH', json });
    }, ok);

  const remove = (id: string): Promise<void> =>
    run(async () => {
      await client.request(`/platform/portal-banner/${id}`, { method: 'DELETE' });
    }, 'Foto eliminada');

  if (!canManage) {
    return (
      <PageContainer>
        <PageHeader title="Banner del portal" description="Acceso restringido." />
        <EmptyState title="Sin acceso" description="No tienes permisos de plataforma." />
      </PageContainer>
    );
  }

  const full = photos.length >= PORTAL_BANNER_MAX_PHOTOS;

  return (
    <PageContainer>
      <PageHeader
        title="Banner del portal"
        description={`Fotos del encabezado del portal general (hasta ${PORTAL_BANNER_MAX_PHOTOS}). Sin fotos activas se muestra el diseño por defecto.`}
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className={styles.list}>
          <Card>
            <CardContent className="space-y-3 pt-6">
              <label htmlFor="banner-file" className="block text-sm font-medium">
                Nueva foto (JPG, PNG o WebP, máx. {BANNER_MAX_MB} MB)
              </label>
              <input
                id="banner-file"
                type="file"
                accept={BANNER_ACCEPT.join(',')}
                disabled={full || busy}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <TextField
                id="banner-alt"
                label="Texto alternativo (obligatorio)"
                value={altText}
                onChange={setAltText}
              />
              <Button disabled={full || busy || !file} onClick={() => void upload()}>
                Subir foto
              </Button>
              {full && (
                <p className="text-sm">
                  Ya hay {PORTAL_BANNER_MAX_PHOTOS} fotos. Elimina una para subir otra.
                </p>
              )}
            </CardContent>
          </Card>

          {photos.length === 0 ? (
            <EmptyState title="No hay fotos configuradas. El portal usa el diseño por defecto." />
          ) : (
            photos.map((photo, index) => (
              <Card key={photo.id}>
                <CardContent className={styles.item}>
                  <img src={photo.imageUrl} alt={photo.altText} className={styles.thumb} />
                  <div className={styles.fields}>
                    <Badge variant="secondary">
                      {photo.isActive ? 'Activa' : 'Inactiva'} · posición {index + 1}
                    </Badge>
                    <TextField
                      id={`alt-${photo.id}`}
                      label="Texto alternativo"
                      value={alts[photo.id] ?? ''}
                      onChange={(value) => setAlts((prev) => ({ ...prev, [photo.id]: value }))}
                    />
                    <div className={styles.actions}>
                      <Button
                        variant="outline"
                        disabled={busy || !(alts[photo.id] ?? '').trim()}
                        onClick={() =>
                          void patch(
                            photo.id,
                            { altText: (alts[photo.id] ?? '').trim() },
                            'Texto guardado',
                          )
                        }
                      >
                        Guardar texto
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || index === 0}
                        onClick={() => void move(index, -1)}
                        aria-label={`Subir ${photo.altText}`}
                      >
                        Subir
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || index === photos.length - 1}
                        onClick={() => void move(index, 1)}
                        aria-label={`Bajar ${photo.altText}`}
                      >
                        Bajar
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void patch(
                            photo.id,
                            { isActive: !photo.isActive },
                            photo.isActive ? 'Foto desactivada' : 'Foto activada',
                          )
                        }
                      >
                        {photo.isActive ? 'Desactivar' : 'Activar'}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void remove(photo.id)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </PageContainer>
  );
}
