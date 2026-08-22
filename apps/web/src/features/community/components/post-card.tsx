import { Link } from 'react-router-dom';
import type { Post } from '@adoptafacil/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';
import {
  TYPE_LABELS,
  commentCountLabel,
  excerpt,
  formatBogota,
  likeCountLabel,
  postDetailHref,
  typeVariant,
} from '../model/community-view';

export interface PostCardProps {
  post: Post;
}

/**
 * Tarjeta de una publicación en el feed cruzado (M11, `/comunidad`). Muestra
 * la autora + (si aplica) la organización, un extracto del cuerpo, y los
 * contadores de comentarios/likes — las interacciones reales (comentar, dar
 * like) viven en el detalle (`PostDetailPage`), no en la tarjeta.
 */
export function PostCard({ post }: PostCardProps) {
  return (
    <Card data-testid="post-card">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={typeVariant(post.type)}>{TYPE_LABELS[post.type]}</Badge>
        </div>
        <CardTitle className="text-base">{post.title ?? post.authorName}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {post.authorName}
          {post.organizationName ? ` · ${post.organizationName}` : ''} ·{' '}
          {formatBogota(post.createdAt)}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-foreground">{excerpt(post.body)}</p>
        {post.images.length > 0 && (
          <img
            src={post.images[0].url}
            alt=""
            className="aspect-video w-full rounded-md border object-cover"
          />
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{commentCountLabel(post.commentCount)}</span>
          <span>{likeCountLabel(post.likeCount)}</span>
        </div>
        <Link
          to={postDetailHref(post.id)}
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver publicación →
        </Link>
      </CardContent>
    </Card>
  );
}
