import { z } from 'zod';

/** Crear una reseña — cualquier Persona autenticada, cruzando tenants (M12,
 *  RF23). `rating` 1-5 (también validado en `create_review()`, defensa en
 *  profundidad). `comment` es opcional; vacío tras trim se guarda como null. */
export const createReviewSchema = z
  .object({
    organizationId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).optional(),
    isAnonymous: z.boolean().optional(),
  })
  .strict();

/** Decisión de moderación (PlatformAdmin/PlatformSuperAdmin) — motivo
 *  obligatorio para rechazar, mismo criterio que `reviewDocumentSchema`. */
export const decideReviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine((value) => value.decision === 'approve' || (value.reason?.length ?? 0) > 0, {
    message: 'A reason is required to reject a review.',
    path: ['reason'],
  });

/** Ocultar una reseña ya aprobada (objetivo #3) — motivo siempre obligatorio. */
export const hideReviewSchema = z
  .object({
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
