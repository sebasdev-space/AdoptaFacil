import type { AdoptionStatus } from '@adoptafacil/contracts';
import { ADOPTION_STATUS_EMAIL_LABELS } from './adoption-status-labels';

/**
 * Link a "Mis solicitudes" (F-CORREO-ADOPCION) — mismo patrón que
 * `buildPasswordResetLink` (core/auth): puro y sin framework para poder
 * testearlo directo, URL pública por entorno (nunca localhost hardcodeado). La
 * ruta requiere sesión (`RequireAuth`); si el solicitante no está autenticado al
 * hacer clic, el shell lo manda a login y lo trae de vuelta — no hace falta un
 * flujo de "magic link" para esto.
 */
export function buildAdoptionRequestsLink(webBaseUrl: string): string {
  const base = webBaseUrl.replace(/\/+$/, '');
  return `${base}/mis-solicitudes`;
}

export interface AdoptionStatusEmailInput {
  applicantName: string;
  animalName: string;
  organizationName?: string;
  status: AdoptionStatus;
  webBaseUrl: string;
}

/** Asunto del correo de cambio de estado — incluye el estado para que se lea sin abrir. */
export function buildAdoptionStatusEmailSubject(input: AdoptionStatusEmailInput): string {
  const statusLabel = ADOPTION_STATUS_EMAIL_LABELS[input.status];
  return `Tu solicitud de adopción de ${input.animalName}: ${statusLabel}`;
}

/**
 * Cuerpo del correo de cambio de estado (F-CORREO-ADOPCION). Solo TEXTO PLANO: el
 * `NotificationPort`/`SmtpNotificationAdapter` actuales envían únicamente `text`
 * (sin `html`) — eso es infra de envío, fuera del alcance de esta tarea (ver
 * reporte de cierre). Dentro de esa restricción: estados en español (mismo
 * wording que "Mis solicitudes", ver `adoption-status-labels.ts`), nombre de la
 * organización cuando está disponible, y un link real a la URL pública por
 * entorno (`WEB_BASE_URL`) — nunca `localhost` hardcodeado.
 */
export function buildAdoptionStatusEmailBody(input: AdoptionStatusEmailInput): string {
  const statusLabel = ADOPTION_STATUS_EMAIL_LABELS[input.status];
  const orgSuffix = input.organizationName ? ` en ${input.organizationName}` : '';
  const link = buildAdoptionRequestsLink(input.webBaseUrl);
  return [
    `Hola ${input.applicantName},`,
    '',
    `El estado de tu solicitud de adopción de ${input.animalName}${orgSuffix} cambió a: ${statusLabel}.`,
    '',
    'Puedes ver el detalle de tu solicitud en AdoptaFácil:',
    link,
    '',
    '— El equipo de AdoptaFácil',
  ].join('\n');
}
