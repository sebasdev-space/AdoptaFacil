import { useEffect, useState } from 'react';
import type { Post, PostsPage } from '@adoptafacil/contracts';
import { EmptyState, Skeleton } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { PostCard } from '../components/post-card';

/**
 * `/mis-publicaciones` (M11, F-8) — las publicaciones propias
 * (`GET /community/posts/mine`), cualquier estado (incl. retiradas por
 * moderación). Sin `@Roles` en el backend (cualquier autenticado), así que
 * sin `<RequireRoles>` aquí — mismo patrón que "Mis ofertas"/"Mis donaciones".
 */
export function MyPostsPage() {
  const client = useApiClient();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const page = await client.request<Partial<PostsPage>>('/community/posts/mine?limit=50');
        if (active) setPosts(Array.isArray(page?.items) ? page.items : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  return (
    <PageContainer>
      <PageHeader
        title="Mis publicaciones"
        description="Todo lo que has publicado en la comunidad."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && posts.length === 0 && (
        <EmptyState
          title="Aún no has publicado nada"
          description="Ve a la comunidad y comparte algo."
        />
      )}
      {!loading && posts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
