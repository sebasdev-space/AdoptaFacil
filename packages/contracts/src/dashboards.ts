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

// ============================================================================
// M13, RF24, S-8 — Dashboards de PLATAFORMA (PlatformAdmin/PlatformSuperAdmin).
// La audiencia Organización es `OrganizationDashboardSummary` arriba (S2-08).
// Documento base: "Dashboards y analítica — por audiencia (organización, Admin
// con cola de revisión, SuperAdmin con indicadores financieros y mapa de
// Colombia, no mapamundi)". Sin serie de tiempo ni analítica histórica en esta
// primera versión (mismo alcance mínimo de S2-08).
// ============================================================================

/**
 * Dashboard de PlatformAdmin (y PlatformSuperAdmin, que ve todo lo de Admin
 * además de su propio dashboard financiero) — consolida en un solo lugar los
 * conteos de las TRES colas de moderación que ya existen por separado
 * (documentos S1-05/S2-06, organizaciones duplicadas S-3, reseñas S-7). Cada
 * conteo es EXACTAMENTE `.length` de la misma cola que ya expone su propio
 * endpoint — nunca un recálculo con un filtro distinto, así que este número
 * siempre coincide con lo que muestra cada cola por separado.
 */
export interface PlatformAdminDashboardSummary {
  /** = `(GET /platform/documents/queue).length` (status IN pending/under_review). */
  pendingDocuments: number;
  /** = `(GET /platform/duplicates/queue).length` (status = pending). */
  pendingDuplicateFlags: number;
  /** = `(GET /platform/reviews/queue).length` — incluye 'pending' Y 'approved'
   *  (una reseña aprobada sigue siendo accionable: puede ocultarse tras un
   *  reporte), MISMO criterio que la propia cola de reseñas, no solo
   *  `status = 'pending'` en aislamiento. */
  pendingReviews: number;
}

/** Un nivel de verificación (0 = ninguno) y cuántas organizaciones lo tienen. */
export interface OrganizationVerificationLevelCount {
  level: number;
  count: number;
}

/** Un departamento (texto libre, tal como quedó guardado en
 *  `OrganizationLocation.department`) y cuántas organizaciones lo declaran.
 *  'Sin especificar' agrupa las que no tienen perfil o no llenaron el campo. */
export interface OrganizationDepartmentCount {
  department: string;
  count: number;
}

/**
 * Dashboard de PlatformSuperAdmin — TODO lo de PlatformAdmin más finanzas
 * agregadas de plataforma y distribución geográfica. Un PlatformAdmin normal
 * NUNCA ve este tipo (403 a nivel de RBAC, no un campo oculto en el mismo
 * payload).
 *
 * Financiero: suma de `breakdown` (mismo cálculo ya persistido por
 * `computeBreakdown()`, M15) de TODAS las donaciones aprobadas de TODAS las
 * organizaciones — nunca una fórmula nueva, solo la suma de lo ya calculado.
 * IVA de cada comisión va sumado dentro de su propio total
 * (platformFeeTotal incluye el IVA de la comisión de plataforma; lo mismo
 * para gatewayFeeTotal), de forma que
 * `grossTotal === platformFeeTotal + gatewayFeeTotal + netTotal` se mantiene
 * como identidad verificable también a nivel agregado.
 *
 * Geografía: `organizationsByDepartment` es una lista simple (para
 * lista/gráfico de barras), NO un mapa interactivo de Colombia — el proyecto
 * no tiene ningún activo geográfico (geojson/SVG/librería de mapas)
 * disponible; construir uno fiel sin ese activo queda como `TODO(client)`,
 * tarea de diseño aparte.
 */
export interface PlatformSuperAdminDashboardSummary {
  grossTotal: number;
  platformFeeTotal: number;
  gatewayFeeTotal: number;
  netTotal: number;
  organizationsByVerificationLevel: OrganizationVerificationLevelCount[];
  /** Animales activos y en adopción, a nivel de TODA la plataforma (misma
   *  definición que `OrganizationDashboardSummary.animalsActive`). */
  activeAnimals: number;
  /** Solicitudes de adopción con status 'approved' — primer conteo de este
   *  dato en el proyecto (no existía antes ni a nivel de organización). */
  totalAdoptions: number;
  /** Campañas con status 'active', a nivel de plataforma. */
  activeCampaigns: number;
  /** Apadrinamientos con status 'active', a nivel de plataforma. */
  activeSponsorships: number;
  organizationsByDepartment: OrganizationDepartmentCount[];
}
