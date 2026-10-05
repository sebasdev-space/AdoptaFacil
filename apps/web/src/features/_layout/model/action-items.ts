import type { OrganizationDashboardSummary } from '@adoptafacil/contracts';

export interface ActionItem {
  key: string;
  label: string;
  href: string;
  linkLabel: string;
}

/**
 * "Requiere tu acción" — SOLO a partir de los conteos reales que YA trae
 * `GET /org/summary` (S2-08). El mockup de referencia muestra 4 acciones con
 * detalle específico (montos, nombre de animal, nombre de documento) que ese
 * endpoint no expone — inventar esos detalles violaría "sin cifras
 * inventadas". Esta versión es la interpretación honesta: mismo propósito
 * (qué necesita atención hoy), solo con lo que el backend YA agrega.
 */
export function deriveActionItems(data: OrganizationDashboardSummary): ActionItem[] {
  const items: ActionItem[] = [];
  if (data.adoptionRequestsPending > 0) {
    items.push({
      key: 'adoptions',
      label: `${data.adoptionRequestsPending} solicitud${data.adoptionRequestsPending === 1 ? '' : 'es'} de adopción sin revisar`,
      href: '/adopciones',
      linkLabel: 'Ir a la bandeja',
    });
  }
  if (data.documentsExpiringSoon > 0) {
    items.push({
      key: 'expiring',
      label: `${data.documentsExpiringSoon} documento${data.documentsExpiringSoon === 1 ? '' : 's'} institucional${data.documentsExpiringSoon === 1 ? '' : 'es'} por vencer`,
      href: '/organizacion/documentos',
      linkLabel: 'Ver documentos',
    });
  }
  if (data.documentsRejected > 0) {
    items.push({
      key: 'rejected',
      label: `${data.documentsRejected} documento${data.documentsRejected === 1 ? '' : 's'} rechazado${data.documentsRejected === 1 ? '' : 's'} · pendiente de subsanar`,
      href: '/organizacion/documentos',
      linkLabel: 'Subsanar',
    });
  }
  return items;
}
