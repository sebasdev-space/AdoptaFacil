/**
 * Email subject/body builders for M08 volunteering (RF18/RF19) — pure and
 * framework-free (same pattern as `adoption-request-email.ts`), so they are
 * testable without NestJS/NotificationPort. Only `text` is sent (the current
 * `NotificationPort`/`SmtpNotificationAdapter` do not support `html` — infra
 * limitation, out of this module's scope).
 */

export interface EnrollmentConfirmationInput {
  volunteerName: string;
  opportunityTitle: string;
  organizationName: string;
}

export function buildEnrollmentConfirmationSubject(input: EnrollmentConfirmationInput): string {
  return `Tu inscripción a "${input.opportunityTitle}" fue recibida`;
}

export function buildEnrollmentConfirmationBody(input: EnrollmentConfirmationInput): string {
  return [
    `Hola ${input.volunteerName},`,
    '',
    `Tu inscripción a "${input.opportunityTitle}" en ${input.organizationName} quedó registrada y está pendiente de aprobación.`,
    '',
    'Te avisaremos apenas la organización la revise.',
    '',
    '— El equipo de AdoptaFácil',
  ].join('\n');
}

export interface EnrollmentDecisionInput {
  volunteerName: string;
  opportunityTitle: string;
  organizationName: string;
  accepted: boolean;
  rejectionReason?: string;
}

export function buildEnrollmentDecisionSubject(input: EnrollmentDecisionInput): string {
  const outcome = input.accepted ? 'aceptada' : 'rechazada';
  return `Tu inscripción a "${input.opportunityTitle}" fue ${outcome}`;
}

export function buildEnrollmentDecisionBody(input: EnrollmentDecisionInput): string {
  const lines = [
    `Hola ${input.volunteerName},`,
    '',
    input.accepted
      ? `¡Buenas noticias! ${input.organizationName} aceptó tu inscripción a "${input.opportunityTitle}". Ya puedes empezar a registrar tus horas.`
      : `${input.organizationName} no pudo aceptar tu inscripción a "${input.opportunityTitle}".`,
  ];
  if (!input.accepted && input.rejectionReason) {
    lines.push('', `Motivo: ${input.rejectionReason}`);
  }
  lines.push('', '— El equipo de AdoptaFácil');
  return lines.join('\n');
}

export interface ServiceHoursDecisionInput {
  volunteerName: string;
  opportunityTitle: string;
  hours: number;
  approved: boolean;
  rejectionReason?: string;
}

export function buildServiceHoursDecisionSubject(input: ServiceHoursDecisionInput): string {
  const outcome = input.approved ? 'aprobadas' : 'rechazadas';
  return `Tus ${input.hours} horas en "${input.opportunityTitle}" fueron ${outcome}`;
}

export function buildServiceHoursDecisionBody(input: ServiceHoursDecisionInput): string {
  const lines = [
    `Hola ${input.volunteerName},`,
    '',
    input.approved
      ? `Tu registro de ${input.hours} horas en "${input.opportunityTitle}" fue aprobado y ya cuenta como horas efectivas.`
      : `Tu registro de ${input.hours} horas en "${input.opportunityTitle}" fue rechazado.`,
  ];
  if (!input.approved && input.rejectionReason) {
    lines.push('', `Motivo: ${input.rejectionReason}`);
  }
  lines.push('', '— El equipo de AdoptaFácil');
  return lines.join('\n');
}

export interface CertificateIssuedInput {
  volunteerName: string;
  opportunityTitle: string;
  organizationName: string;
  totalApprovedHours: number;
}

export function buildCertificateIssuedSubject(input: CertificateIssuedInput): string {
  return `Tu certificado de voluntariado en "${input.opportunityTitle}" está listo`;
}

export function buildCertificateIssuedBody(input: CertificateIssuedInput): string {
  return [
    `Hola ${input.volunteerName},`,
    '',
    `${input.organizationName} emitió tu certificado de voluntariado en "${input.opportunityTitle}", reflejando ${input.totalApprovedHours} horas efectivas.`,
    '',
    'Puedes descargarlo desde "Mi voluntariado" en AdoptaFácil.',
    '',
    '— El equipo de AdoptaFácil',
  ].join('\n');
}
