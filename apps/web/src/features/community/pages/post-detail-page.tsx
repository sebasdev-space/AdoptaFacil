import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Comment, CommentsPage, Post, ToggleLikeResult } from '@adoptafacil/contracts';
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
import {
  TYPE_LABELS,
  commentCountLabel,
  formatBogota,
  likeCountLabel,
  typeVariant,
} from '../model/community-view';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * `/comunidad/:id` (M11, F-8) — detalle de una publicación: cuerpo completo,
 * fotos, comentarios (agregar/ver/borrar el propio), like, y — solo para la
 * autora — editar/borrar. `likedByMe` NO viene del backend (el contrato no
 * expone estado por espectador); el botón refleja únicamente lo que el
 * usuario alternó EN ESTA SESIÓN, nunca una historia previa fingida.
 */
export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useApiClient();
  const { user } = useSession();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [state, setState] = useState<LoadState>('loading');
  const [post, setPost] = useState<Post | null>(null);
  const [liked, setLiked] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);

  const myUserId = user?.id;
  const isAuthor = !!post && !!myUserId && post.authorUserId === myUserId;

  const loadComments = async (): Promise<void> => {
    if (!id) return;
    const page = await client.request<Partial<CommentsPage>>(
      `/community/posts/${encodeURIComponent(id)}/comments?limit=50`,
    );
    setComments(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    if (!id) {
      setState('not-found');
      return;
    }
    let active = true;
    void (async () => {
      try {
        const found = await client.request<Post>(`/community/posts/${encodeURIComponent(id)}`);
        if (active) {
          setPost(found);
          setEditTitle(found.title ?? '');
          setEditBody(found.body);
          setState('ready');
        }
      } catch {
        if (active) setState('error');
      }
    })();
    void loadComments();
    return () => {
      active = false;
    };
  }, [client, id]);

  const toggleLike = async (): Promise<void> => {
    if (!id || !post) return;
    try {
      const result = await client.request<ToggleLikeResult>(
        `/community/posts/${encodeURIComponent(id)}/like`,
        { method: 'POST' },
      );
      setLiked(result.liked);
      setPost({ ...post, likeCount: result.likeCount });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar el like',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const submitComment = async (): Promise<void> => {
    if (!id || !commentBody.trim()) return;
    setPostingComment(true);
    try {
      await client.request<Comment>(`/community/posts/${encodeURIComponent(id)}/comments`, {
        method: 'POST',
        json: { body: commentBody.trim() },
      });
      setCommentBody('');
      await loadComments();
      setPost((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
      toast({ title: 'Comentario agregado', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo comentar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setPostingComment(false);
    }
  };

  const removeComment = async (commentId: string): Promise<void> => {
    try {
      await client.request(`/community/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
      });
      await loadComments();
      setPost((prev) =>
        prev ? { ...prev, commentCount: Math.max(prev.commentCount - 1, 0) } : prev,
      );
    } catch (error) {
      toast({
        title: 'No se pudo eliminar el comentario',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const saveEdit = async (): Promise<void> => {
    if (!id || editBody.trim().length < 10) {
      toast({
        title: 'Publicación muy corta',
        description: 'Escribe al menos 10 caracteres.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await client.request<Post>(`/community/posts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        json: { title: editTitle.trim() || undefined, body: editBody.trim() },
      });
      setPost(updated);
      setEditing(false);
      toast({ title: 'Publicación actualizada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!id) return;
    try {
      await client.request(`/community/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast({ title: 'Publicación eliminada', variant: 'success' });
      navigate('/comunidad');
    } catch (error) {
      toast({
        title: 'No se pudo eliminar la publicación',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Publicación" description="Detalle, comentarios y likes." />
      <Link
        to="/comunidad"
        className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Volver a la comunidad
      </Link>

      {state === 'loading' && <Skeleton className="h-64 w-full" />}
      {state === 'not-found' && (
        <EmptyState title="Publicación no encontrada" description="Falta el identificador." />
      )}
      {state === 'error' && (
        <EmptyState
          title="No se pudo cargar"
          description="La publicación no existe, fue retirada por moderación, o inténtalo de nuevo más tarde."
        />
      )}

      {state === 'ready' && post && (
        <div className="space-y-6">
          <Card data-testid="post-detail">
            <CardHeader className="gap-2">
              <Badge variant={typeVariant(post.type)}>{TYPE_LABELS[post.type]}</Badge>
              <CardTitle>{post.title ?? post.authorName}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {post.authorName}
                {post.organizationName ? ` · ${post.organizationName}` : ''} ·{' '}
                {formatBogota(post.createdAt)}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {editing ? (
                <div className="space-y-3">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    aria-label="Título"
                  />
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={6}
                    aria-label="Cuerpo"
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button disabled={saving} onClick={() => void saveEdit()}>
                      {saving ? 'Guardando…' : 'Guardar'}
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-foreground">{post.body}</p>
              )}

              {post.images.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {post.images.map((image) => (
                    <img
                      key={image.id}
                      src={image.url}
                      alt=""
                      className="aspect-square w-full rounded-md border object-cover"
                    />
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={liked ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => void toggleLike()}
                >
                  {liked ? 'Ya te gusta' : 'Me gusta'}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {likeCountLabel(post.likeCount)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {commentCountLabel(post.commentCount)}
                </span>
              </div>

              {isAuthor && !editing && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void remove()}>
                    Eliminar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comentarios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Escribe un comentario…"
                  aria-label="Comentario"
                />
                <Button
                  disabled={postingComment || !commentBody.trim()}
                  onClick={() => void submitComment()}
                >
                  {postingComment ? 'Enviando…' : 'Comentar'}
                </Button>
              </div>
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay comentarios.</p>
              ) : (
                <ul className="space-y-3">
                  {comments.map((comment) => (
                    <li key={comment.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{comment.authorName}</p>
                        {myUserId === comment.authorUserId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void removeComment(comment.id)}
                          >
                            Eliminar
                          </Button>
                        )}
                      </div>
                      <p className="mt-1 text-foreground">{comment.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatBogota(comment.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
