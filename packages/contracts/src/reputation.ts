// Module: reputation (M12, RF23) — Review/Rating de organizaciones con
// arquitectura preparada para moderación (S-7). PlatformAdmin/PlatformSuperAdmin
// moderan; la organización reseñada NUNCA modera sus propias reseñas.

export enum ReviewStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
  Hidden = 'hidden',
}

/**
 * Contenido de una reseña — inmutable tras el envío. Solo `status` y las
 * columnas de moderación transicionan, y únicamente vía las funciones
 * SECURITY DEFINER del backend (pending -> approved|rejected,
 * approved -> hidden). `authorUserId` siempre queda registrado internamente
 * aunque `isAnonymous` sea true — la anonimidad es únicamente de cara al
 * público (mismo criterio que las donaciones anónimas de RF13/M05).
 *
 * Excepción (S7-b, reseña pública del portal): `authorUserId` es `undefined`
 * cuando la reseña viene del botón "Registrar reseña" del portal público
 * (`POST /public/organizations/:slug/reviews`, sin sesión) — no hay ninguna
 * identidad que registrar. Esas filas nacen ya `Approved` y su único
 * moderador es el Owner/Administrator de la organización reseñada
 * (`POST /reviews/:id/mark-spam`), nunca PlatformAdmin.
 */
export interface Review {
  id: string;
  organizationId: string;
  /** Ausente para una reseña pública/anónima del portal (ver nota de arriba). */
  authorUserId?: string;
  rating: number;
  comment?: string;
  isAnonymous: boolean;
  status: ReviewStatus;
  moderatedByUserId?: string;
  moderatedAt?: string;
  /** Motivo del rechazo, O de un ocultamiento posterior (approved -> hidden)
   *  — el mismo campo cubre ambos casos, nunca se usa fuera de esas dos
   *  transiciones. */
  rejectionReason?: string;
  createdAt: string;
}

/** "Mis reseñas" — la reseña propia del autor, con el nombre de la
 *  organización ya resuelto para no requerir una segunda llamada. */
export interface ReviewMine extends Review {
  organizationName: string;
}

/** Cola de moderación de PlatformAdmin — incluye la identidad real del autor
 *  (visibilidad INTERNA únicamente; nunca se expone así al público, sin
 *  importar `isAnonymous`) y el nombre de la organización reseñada. */
export interface ReviewModerationQueueItem extends Review {
  organizationName: string;
  authorName: string;
}

export interface CreateReviewInput {
  organizationId: string;
  rating: number;
  comment?: string;
  isAnonymous?: boolean;
}

/** `POST /public/organizations/:slug/reviews` (S7-b) — sin sesión, la org sale
 *  del slug de la URL, no del body. Siempre anónima (no hay identidad). */
export interface CreatePublicReviewInput {
  rating: number;
  comment?: string;
}

export type ReviewDecision = 'approve' | 'reject';

export interface DecideReviewInput {
  decision: ReviewDecision;
  /** Obligatorio cuando decision === 'reject'. */
  reason?: string;
}

/** approved -> hidden, tras un reporte posterior (objetivo #3). No existe un
 *  mecanismo público de "reportar reseña" en este alcance — TODO(client) si
 *  se requiere uno; mientras tanto, PlatformAdmin invoca esto directamente. */
export interface HideReviewInput {
  reason: string;
}

/**
 * Indicadores públicos de confianza. Expuestos vía una función/vista de solo
 * lectura (`organization_reputation_summary`, mismo patrón que
 * `legal_representative_summary` de S-1) — NUNCA como campo del contrato
 * `Organization` (org.ts queda intacto; contratos aditivos).
 */
export interface OrganizationReputationSummary {
  organizationId: string;
  averageRating: number;
  approvedReviewsCount: number;
}

/** Reseña pública — identidad oculta si `isAnonymous` fue true al enviarla.
 *  Solo reseñas `approved` llegan aquí; nunca incluye `authorUserId`,
 *  `organizationId` ni `status` (todas son, por definición, aprobadas). */
export interface PublicReview {
  id: string;
  rating: number;
  comment?: string;
  /** Ausente cuando la reseña se marcó anónima. */
  authorName?: string;
  createdAt: string;
}
