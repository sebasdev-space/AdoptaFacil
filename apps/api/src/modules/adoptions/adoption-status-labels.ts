import type { AdoptionStatus } from '@adoptafacil/contracts';

/**
 * Etiquetas es-CO por estado de la solicitud de adopción (F-CORREO-ADOPCION). DEBE
 * coincidir con `ADOPTION_STATUS_LABELS` en
 * `apps/web/src/features/adoptions/model/adoptions-view.ts` — es el mismo wording
 * que el solicitante ya ve en "Mis solicitudes", para que el correo no diverja de
 * la UI. Mismo patrón de duplicación intencional y documentada que
 * `ADOPTION_NEXT_STATUSES` (frontend) frente a `ADOPTION_TRANSITIONS` (aquí): el
 * backend no puede importar código de `apps/web`, así que se refleja a mano.
 */
export const ADOPTION_STATUS_EMAIL_LABELS: Record<AdoptionStatus, string> = {
  new: 'Nuevas',
  in_review: 'En evaluación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};
