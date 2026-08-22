// Module: M11 community · Contracts owner: @fabian
//
// Comunidad (Consolidación operativa, M11): publicaciones, comentarios y likes
// compartidos entre TODAS las organizaciones y personas de la plataforma — a
// diferencia de M06/M09/M10, el "dueño" del dato aquí no define quién puede
// VERLO: el feed es cruzado por diseño (como una red social), aunque cada fila
// sigue llevando `organizationId` (posiblemente `undefined`) para que la
// organización autora conserve gestión propia bajo RLS. Ver `community.prisma`
// para el criterio exacto de cuándo `organizationId` va vacío. Moderación
// básica restringida a PlatformAdmin/PlatformSuperAdmin.

/**
 * Tipo de publicación — enum CERRADO. Determina el ícono/etiqueta en el feed
 * y si dispara notificación por correo (solo `campaign`).
 * - `general`  — publicación libre (historias, agradecimientos, preguntas)
 * - `campaign` — anuncio de una campaña de recaudación de la organización
 * - `notice`   — aviso / comunicado
 * - `event`    — evento (jornada de adopción, feria, etc.)
 */
export enum PostType {
  General = 'general',
  Campaign = 'campaign',
  Notice = 'notice',
  Event = 'event',
}

/** Tipos permitidos, exportados para validación y filtros de UI. */
export const POST_TYPES: readonly PostType[] = [
  PostType.General,
  PostType.Campaign,
  PostType.Notice,
  PostType.Event,
];

/**
 * Estado de moderación de una publicación.
 * - `published` — visible en el feed
 * - `removed`   — retirada por moderación de plataforma; solo la autora y el
 *   equipo de plataforma la ven (en "mis publicaciones" / la cola de moderación).
 */
export enum PostStatus {
  Published = 'published',
  Removed = 'removed',
}

/**
 * Foto adjunta a una publicación. Solo METADATA persistida (storage ref +
 * orden); `url` se resuelve para presentación, nunca se guarda.
 */
export interface PostImage {
  id: string;
  storageRef: string;
  order: number;
  url: string;
}

/**
 * Publicación de la comunidad. `organizationId`/`organizationName` están
 * AUSENTES cuando la autora es una cuenta Persona (publicación general de
 * plataforma, sin afiliación organizacional que mostrar) — ver
 * `community.prisma` para el criterio completo. `authorName` es un snapshot
 * (nombre visible al momento de publicar), igual que `donor`/`payer` en
 * donaciones.
 */
export interface Post {
  id: string;
  organizationId?: string;
  organizationName?: string;
  authorUserId: string;
  authorName: string;
  type: PostType;
  title?: string;
  body: string;
  images: PostImage[];
  commentCount: number;
  likeCount: number;
  status: PostStatus;
  /** Presente solo cuando `status === 'removed'`. */
  moderationReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** Reservar una foto para una publicación (mismo flujo en dos pasos que el
 *  resto de la plataforma). Solo JPEG/PNG — enum cerrado por el formulario. */
export interface PostImageInput {
  filename: string;
  contentType: 'image/jpeg' | 'image/png';
  order?: number;
}

/** Publicar (10–2000 caracteres en `body`). `title` opcional. Hasta 6 fotos. */
export interface CreatePostInput {
  type: PostType;
  title?: string;
  body: string;
  images?: PostImageInput[];
}

/**
 * Resultado de publicar: la publicación creada + el target de subida (mismo
 * flujo en dos pasos que el resto de la plataforma) para CADA foto
 * reservada. `order` es el MISMO valor enviado en `PostImageInput.order` (o
 * el índice implícito), así que el cliente puede emparejar cada entrada con
 * el archivo original SIN depender del orden de llegada (no garantizado).
 */
export interface CreatePostResult {
  post: Post;
  imageUploads: Array<{ imageId: string; order: number; url: string; key: string }>;
}

/** Editar la publicación propia — solo título/cuerpo; las fotos no se editan
 *  después de publicar (mismo alcance mínimo del resto de esta Ola). */
export interface UpdatePostInput {
  title?: string;
  body?: string;
}

/** Página del feed cruzado (todas las organizaciones + publicaciones de
 *  plataforma), o de "mis publicaciones" propias — misma forma. */
export interface PostsPage {
  items: Post[];
  total: number;
  limit: number;
  offset: number;
}

/** Un comentario en una publicación. `authorName` es snapshot, igual que en
 *  `Post`. */
export interface Comment {
  id: string;
  postId: string;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/** Comentar (1–1000 caracteres). */
export interface CreateCommentInput {
  body: string;
}

export interface CommentsPage {
  items: Comment[];
  total: number;
  limit: number;
  offset: number;
}

/** Resultado de alternar el like propio sobre una publicación. */
export interface ToggleLikeResult {
  liked: boolean;
  likeCount: number;
}

// ============================================================================
// Moderación básica (plataforma) — PlatformAdmin/PlatformSuperAdmin únicamente.
// Acceso cross-tenant vía función SECURITY DEFINER acotada (mismo patrón que
// M01 `platform_document_decide`), nunca un select crudo que evada RLS.
// ============================================================================

/** Decisión de moderación. `reason` es obligatorio para `remove`. */
export interface ModeratePostInput {
  decision: 'remove' | 'restore';
  reason?: string;
}
