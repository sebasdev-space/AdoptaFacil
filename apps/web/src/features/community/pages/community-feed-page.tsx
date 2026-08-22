import { useEffect, useState } from 'react';
import {
  POST_TYPES,
  PostType,
  type CreatePostInput,
  type CreatePostResult,
  type Post,
  type PostsPage,
} from '@adoptafacil/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { PostCard } from '../components/post-card';
import { TextAreaField } from '../components/community-form-fields';
import { TYPE_LABELS } from '../model/community-view';
import { IMAGE_ACCEPT, uploadImageFile, validateImageUpload } from '../lib/storage';

const MAX_IMAGES = 6;

/**
 * `/comunidad` (M11, F-8) — feed cruzado: publicaciones de todas las
 * organizaciones + de plataforma (`GET /community/posts`), con filtro por
 * tipo. Cualquier usuario autenticado (organización o Persona) puede
 * publicar — sin `@Roles` en el backend, así que sin `<RequireRoles>` aquí.
 */
export function CommunityFeedPage() {
  const client = useApiClient();
  const { toast } = useToast();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PostType | 'all'>('all');
  const [showForm, setShowForm] = useState(false);

  const [type, setType] = useState<PostType>(PostType.General);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async (activeFilter: PostType | 'all'): Promise<void> => {
    const qs = activeFilter !== 'all' ? `?type=${activeFilter}&limit=50` : '?limit=50';
    const page = await client.request<Partial<PostsPage>>(`/community/posts${qs}`);
    setPosts(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        await load(filter);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, filter]);

  const resetForm = (): void => {
    setType(PostType.General);
    setTitle('');
    setBody('');
    setFiles([]);
  };

  const onPickFiles = (fileList: FileList | null): void => {
    const picked = Array.from(fileList ?? []).slice(0, MAX_IMAGES);
    for (const file of picked) {
      const invalid = validateImageUpload(file);
      if (invalid) {
        toast({ title: 'Archivo no válido', description: invalid, variant: 'warning' });
        return;
      }
    }
    setFiles(picked);
  };

  const submit = async (): Promise<void> => {
    if (body.trim().length < 10) {
      toast({
        title: 'Publicación muy corta',
        description: 'Escribe al menos 10 caracteres.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const input: CreatePostInput = {
        type,
        ...(title.trim() ? { title: title.trim() } : {}),
        body: body.trim(),
        ...(files.length > 0
          ? {
              images: files.map((file, index) => ({
                filename: file.name,
                contentType: file.type as 'image/jpeg' | 'image/png',
                order: index,
              })),
            }
          : {}),
      };
      const result = await client.request<CreatePostResult>('/community/posts', {
        method: 'POST',
        json: input,
      });
      await Promise.all(
        result.imageUploads.map((upload) => {
          const file = files[upload.order];
          return file ? uploadImageFile(client, upload.key, file) : Promise.resolve();
        }),
      );
      resetForm();
      setShowForm(false);
      await load(filter);
      toast({ title: 'Publicación creada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo publicar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Comunidad"
        description="Publicaciones, avisos y campañas de organizaciones y personas de AdoptaFácil."
        actions={<Button onClick={() => setShowForm(true)}>Publicar</Button>}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          aria-pressed={filter === 'all'}
          className={`rounded-full border px-3 py-1 text-sm ${
            filter === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
          }`}
        >
          Todas
        </button>
        {POST_TYPES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input'
            }`}
          >
            {TYPE_LABELS[value]}
          </button>
        ))}
      </div>

      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-6">
          {posts.length === 0 ? (
            <EmptyState
              icon={<span aria-hidden>💬</span>}
              title="Aún no hay publicaciones"
              description="Sé la primera persona en publicar algo en la comunidad."
              action={<Button onClick={() => setShowForm(true)}>Publicar la primera</Button>}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva publicación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="post-type" className="block text-sm font-medium text-foreground">
                  Tipo
                </label>
                <select
                  id="post-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as PostType)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {POST_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="post-title" className="block text-sm font-medium text-foreground">
                  Título (opcional)
                </label>
                <Input id="post-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>
            <TextAreaField
              id="post-body"
              label="Publicación (10-2000 caracteres)"
              value={body}
              onChange={setBody}
              rows={6}
              placeholder="Comparte algo con la comunidad de AdoptaFácil…"
            />
            <div className="space-y-1.5">
              <label htmlFor="post-images" className="block text-sm font-medium text-foreground">
                Fotos (opcional, hasta {MAX_IMAGES}, JPG o PNG, máx. 5 MB c/u)
              </label>
              <input
                id="post-images"
                type="file"
                multiple
                accept={IMAGE_ACCEPT.join(',')}
                onChange={(e) => onPickFiles(e.target.files)}
                className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? 'Publicando…' : 'Publicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
