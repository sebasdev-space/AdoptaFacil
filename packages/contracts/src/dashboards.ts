// Module: dashboards (M13) · Contracts owner: @sebastian
//
// Minimal organization summary (S2-08, adelantado de Ola 3 para el pitch del
// 13-ago — decisión `RutaPresentacion_13Ago_20260809.md`). SOLO conteos/totales
// actuales que YA se calculan en otro lugar de la aplicación (animales,
// solicitudes de adopción, apadrinamientos, documentos, formalización,
// donaciones) — sin serie de tiempo, sin analítica, sin desglose financiero
// bruto/comisión/neto. El dashboard ejecutivo completo del wireframe del
// cliente es Ola 3 real y NO está representado aquí.

/**
 * Resumen mínimo de la organización autenticada, para las tarjetas de resumen
 * de la Fase C3 del rediseño visual (@fabian). Todos los campos son primitivos
 * (`number`), sin objetos anidados — cada uno cuenta/suma una sola cosa y nunca
 * es `null` (una organización sin datos en una categoría reporta `0`).
 */
export interface OrganizationDashboardSummary {
  /** Animales activos y en adopción (is_active=true AND status='available') —
   *  misma definición de "adoptable" que ya usa el catálogo público (T-029). */
  animalsActive: number;
  /** Solicitudes de adopción en 'new' o 'in_review' ("Nuevas" + "En evaluación",
   *  mismas etiquetas que `ADOPTION_STATUS_EMAIL_LABELS`). */
  adoptionRequestsPending: number;
  /** Apadrinamientos con status 'active' (S2-03). */
  sponsorshipsActive: number;
  /** Documentos institucionales Approved cuyo `expiresAt` cae dentro de la
   *  ventana configurable `DOCUMENTS_EXPIRING_SOON_WINDOW_DAYS` (aún no
   *  vencidos — un documento ya vencido cuenta como Expired, no aquí). */
  documentsExpiringSoon: number;
  /** Documentos institucionales con status 'rejected' (pendientes de
   *  subsanar, S2-06). */
  documentsRejected: number;
  /** Suma histórica de `breakdown.net` de donaciones APROBADAS atribuidas
   *  directamente a la organización (`PaymentConcept.kind === 'organization'`,
   *  P1) — el dinero atribuido a campañas específicas ya se refleja en
   *  `Campaign.raisedAmount` (S2-07) y no se duplica aquí. */
  donationsReceivedTotal: number;
  /** Nivel de verificación (VerificationLevel.level) — el mismo que ya expone
   *  `GET /org/documents/verification` (0 si aún no alcanza ningún nivel). */
  formalizationLevel: number;
  /** % de formalización derivado de la posición en FORMALIZATION_SEQUENCE
   *  (0–100) — MISMA fórmula que `deriveFormalizationPct` del shell
   *  (`apps/web/src/shell/transparency`), duplicada aquí porque el backend no
   *  puede importar código de `apps/web`. */
  formalizationPercent: number;
}
