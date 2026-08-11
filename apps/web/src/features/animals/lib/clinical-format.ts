import { ClinicalEventType } from '@adoptafacil/contracts';

/** Compartido entre `AnimalClinicalPanel` (shell, sin cambios) y las nuevas
 *  secciones Registro/Carnet del panel maestro-detalle (refactor visual M03). */
export const CLINICAL_TYPE_LABELS: Record<ClinicalEventType, string> = {
  [ClinicalEventType.Vaccine]: 'Vacuna',
  [ClinicalEventType.Treatment]: 'Tratamiento',
  [ClinicalEventType.Surgery]: 'Cirugía',
  [ClinicalEventType.Sterilization]: 'Esterilización',
  [ClinicalEventType.Allergy]: 'Alergia',
  [ClinicalEventType.Disability]: 'Incapacidad',
  [ClinicalEventType.Medication]: 'Medicamento',
  [ClinicalEventType.Diagnosis]: 'Diagnóstico',
};

export function formatClinicalDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : '—';
}
