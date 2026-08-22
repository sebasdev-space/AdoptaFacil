import { useEffect, useState } from 'react';
import { Role, type Post, type PostsPage } from '@adoptafacil/contracts';
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
import { TYPE_LABELS, formatBogota, typeVariant } from '../model/community-view';

/**
 * `/plataforma/comunidad` (M11, F-8) — moderación básica cross-tenant:
 * `GET`/`PATCH /platform/community/posts`. Solo PlatformAdmin/
 * PlatformSuperAdmin — mismo patrón que `PlatformDocumentsReviewPage` (M01).
 */
export function CommunityModerationPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canModerate = hasRole(Role.PlatformAdmin) || hasRole(Role.PlatformSuperAdmin);
  const { toast } = useToast();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const page = await client.request<Partial<PostsPage>>('/platform/community/posts?limit=50');
    setPosts(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    if (!canModerate) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, canModerate]);

  const moderate = async (id: string, decision: 'remove' | 'restore'): Promise<void> => {
    const reason = reasons[id]?.trim();
    if (decision === 'remove' && !reason) {
      toast({
        title: 'Motivo requerido',
        description: 'Indica el motivo para retirar la publicación.',
        variant: 'warning',
      });
      return;
    }
    setBusy(id);
    try {
      await client.request(`/platform/community/posts/${encodeURIComponent(id)}/moderate`, {
        method: 'PATCH',
        json: { decision, ...(reason ? { reason } : {}) },
      });
      await load();
      toast({ title: 'Decisión registrada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo registrar la decisión',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  if (!canModerate) {
    return (
      <PageContainer>
        <PageHeader title="Moderación de comunidad" description="Acceso restringido." />
        <EmptyState title="Sin acceso" description="No tienes permisos de plataforma." />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Moderación de comunidad"
        description="Publicaciones de todas las organizaciones y de plataforma."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && posts.length === 0 && <EmptyState title="No hay publicaciones para revisar." />}
      {!loading && posts.length > 0 && (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardHeader className="gap-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {post.title ?? post.authorName}
                  <Badge variant={typeVariant(post.type)}>{TYPE_LABELS[post.type]}</Badge>
                  <Badge variant={post.status === 'removed' ? 'destructive' : 'success'}>
                    {post.status === 'removed' ? 'Retirada' : 'Activa'}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {post.authorName}
                  {post.organizationName ? ` · ${post.organizationName}` : ' · Plataforma'} ·{' '}
                  {formatBogota(post.createdAt)}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-foreground">{post.body}</p>
                {post.moderationReason && (
                  <p className="text-xs text-muted-foreground">
                    Motivo de retiro: {post.moderationReason}
                  </p>
                )}
                <Input
                  placeholder="Motivo (requerido para retirar)"
                  value={reasons[post.id] ?? ''}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [post.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  {post.status === 'removed' ? (
                    <Button
                      size="sm"
                      disabled={busy === post.id}
                      onClick={() => void moderate(post.id, 'restore')}
                    >
                      Restaurar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === post.id}
                      onClick={() => void moderate(post.id, 'remove')}
                    >
                      Retirar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
