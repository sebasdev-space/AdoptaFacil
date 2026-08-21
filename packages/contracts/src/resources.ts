// Module: M09 resources · Contracts owner: @fabian
//
// Banco de recursos (Ola 3, "Consolidación operativa" M09). Una organización
// PUBLICA una necesidad (p. ej. "20kg de alimento para gatos"); un donante
// (persona u otra organización) OFRECE cubrirla total o parcialmente; al
// aceptar la oferta, la organización coordina una ENTREGA y la cierra con
// evidencia fotográfica (StoragePort). Es donación FÍSICA — nunca dinero, así
// que este módulo NO depende del PaymentPort (M15): sin dependencias cruzadas.
//
// Cantidades son SIEMPRE enteros positivos (nunca fracciones — "20kg" es una
// cantidad de 20 en la unidad "kg", nunca 20.5). Timestamps ISO-8601 UTC.

/** Categoría cerrada de la necesidad/oferta. */
export enum ResourceCategory {
  /** alimento */
  Food = 'food',
  /** medicamentos / insumos veterinarios */
  Medicine = 'medicine',
  /** insumos de aseo, camas, transportadoras, etc. */
  Supplies = 'supplies',
  /** equipo (jaulas, básculas, refrigeración, etc.) */
  Equipment = 'equipment',
  Other = 'other',
}

export const RESOURCE_CATEGORIES: readonly ResourceCategory[] = [
  ResourceCategory.Food,
  ResourceCategory.Medicine,
  ResourceCategory.Supplies,
  ResourceCategory.Equipment,
  ResourceCategory.Other,
];

/**
 * Ciclo de vida de una necesidad (mínimo, refinable — TODO(client) si el
 * negocio quiere más estados, p. ej. una revisión antes de publicar):
 *   - `needed`               — recién publicada, nada entregado aún.
 *   - `partially_fulfilled`  — al menos una entrega se completó, pero no cubre
 *                              `quantityNeeded` todavía.
 *   - `fulfilled`            — `quantityFulfilled >= quantityNeeded`.
 *   - `cancelled`            — la organización la retiró; terminal.
 */
export enum ResourceNeedStatus {
  Needed = 'needed',
  PartiallyFulfilled = 'partially_fulfilled',
  Fulfilled = 'fulfilled',
  Cancelled = 'cancelled',
}

/**
 * Necesidad publicada por una organización (interna — incluye todos los
 * campos). `progress`/`quantityFulfilled` son DERIVADOS de las entregas
 * completadas (nunca se editan a mano) — ver `computeFulfillmentProgress`.
 */
export interface ResourceNeed {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  category: ResourceCategory;
  quantityNeeded: number;
  /** Unidad libre (p. ej. "kg", "unidades", "bultos"). */
  unit: string;
  quantityFulfilled: number;
  /** Derivado: quantityFulfilled / quantityNeeded, acotado a [0, 1]. */
  progress: number;
  status: ResourceNeedStatus;
  createdAt: string;
  updatedAt: string;
}

/** Proyección pública de una necesidad (catálogo de donantes) — mismos campos
 *  que {@link ResourceNeed} más el nombre de la organización, sin nada interno. */
export interface ResourceNeedPublic {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description?: string;
  category: ResourceCategory;
  quantityNeeded: number;
  unit: string;
  quantityFulfilled: number;
  progress: number;
  status: ResourceNeedStatus;
  createdAt: string;
}

/** Publicar una necesidad (Owner/Administrator/Operator). */
export interface CreateResourceNeedInput {
  title: string;
  description?: string;
  category: ResourceCategory;
  quantityNeeded: number;
  unit: string;
}

/** Editar una necesidad. Todos los campos opcionales; solo cambian los que
 *  vienen. `status: 'cancelled'` es la única transición manual de estado —
 *  `partially_fulfilled`/`fulfilled` los deriva el sistema al completar
 *  entregas, nunca el cliente. */
export interface UpdateResourceNeedInput {
  title?: string;
  description?: string;
  category?: ResourceCategory;
  quantityNeeded?: number;
  unit?: string;
  status?: ResourceNeedStatus.Cancelled;
}

/** Página de necesidades públicas (`GET /public/resources/needs`). */
export interface ResourceNeedsPage {
  items: ResourceNeedPublic[];
  total: number;
  limit: number;
  offset: number;
}

/** Página de necesidades de la organización (`GET /resources/needs`). */
export interface ResourceNeedsOwnPage {
  items: ResourceNeed[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// Ofertas — un donante (Persona u organización, cross-tenant por identidad,
// mismo patrón que M05 Donation) ofrece cubrir una necesidad total o
// parcialmente. Sin PaymentPort, sin idempotencyKey (no hay reintento de
// gateway que duplicar — un envío de formulario no lo necesita).
// ============================================================================

/**
 * Ciclo de vida de una oferta:
 *   - `offered`   — el donante la envió; espera decisión de la organización.
 *   - `accepted`  — la organización la aceptó; se crea una entrega (`scheduled`).
 *   - `declined`  — la organización la rechazó; terminal.
 *   - `cancelled` — el propio donante la retiró ANTES de que se decidiera;
 *                   terminal (no se puede cancelar una ya aceptada/rechazada).
 */
export enum ResourceOfferStatus {
  Offered = 'offered',
  Accepted = 'accepted',
  Declined = 'declined',
  Cancelled = 'cancelled',
}

/** Una oferta de donación física. `organizationId` es la organización
 *  BENEFICIARIA (dueña de la necesidad) — igual que `Donation`. */
export interface ResourceOffer {
  id: string;
  organizationId: string;
  needId: string;
  donorUserId: string;
  quantityOffered: number;
  message?: string;
  status: ResourceOfferStatus;
  createdAt: string;
  updatedAt: string;
}

/** Enriquecida con datos de la necesidad y, si ya se aceptó, el estado de su
 *  entrega — lo que ve el donante en "mis ofertas" (evita que el frontend
 *  haga dos consultas más por cada una). */
export interface ResourceOfferWithNeed extends ResourceOffer {
  needTitle: string;
  needUnit: string;
  organizationName: string;
  deliveryStatus?: ResourceDeliveryStatus;
  deliveryScheduledAt?: string;
  deliveryCompletedAt?: string;
}

/** Ofrecer cubrir una necesidad (cualquier autenticado — Persona u org). */
export interface CreateResourceOfferInput {
  needId: string;
  quantityOffered: number;
  message?: string;
}

/** La organización decide sobre una oferta `offered` (Owner/Administrator/Operator). */
export interface DecideResourceOfferInput {
  decision: 'accept' | 'decline';
}

// ============================================================================
// Entregas — se crea automáticamente al ACEPTAR una oferta (status inicial
// `scheduled`); la organización coordina método/fecha y la cierra con
// evidencia. Al completarla, su cantidad se aplica UNA SOLA VEZ a la
// necesidad (idempotencia vía `ResourceFulfillmentApplication`, mismo patrón
// que `CampaignFundingApplication`) — ver el backend.
// ============================================================================

export enum ResourceDeliveryMethod {
  /** El donante lleva el recurso a la organización. */
  Pickup = 'pickup',
  /** La organización recoge donde el donante. */
  Dropoff = 'dropoff',
}

/** `scheduled` (recién creada al aceptar la oferta) → `completed` | `cancelled`
 *  (ambos terminales). */
export enum ResourceDeliveryStatus {
  Scheduled = 'scheduled',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export interface ResourceDelivery {
  id: string;
  organizationId: string;
  offerId: string;
  needId: string;
  method?: ResourceDeliveryMethod;
  scheduledAt?: string;
  status: ResourceDeliveryStatus;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fijar/actualizar método y fecha mientras sigue `scheduled`. */
export interface ScheduleResourceDeliveryInput {
  method?: ResourceDeliveryMethod;
  scheduledAt?: string;
}

/** Cerrar la entrega. `actualQuantity` (opcional) es lo REALMENTE entregado —
 *  si se omite, se usa `quantityOffered` de la oferta (caso común: se entregó
 *  justo lo ofrecido). Solo válido desde `scheduled`. */
export interface CompleteResourceDeliveryInput {
  actualQuantity?: number;
}

/** Página de entregas de la organización (`GET /resources/deliveries`). */
export interface ResourceDeliveriesPage {
  items: ResourceDelivery[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================================
// Evidencia de entrega — mismo patrón de subida en dos pasos que
// CampaignEvidence: el cliente pide "quiero subir este archivo", el backend
// devuelve la fila + el destino de subida; el cliente hace el PUT de los bytes.
// ============================================================================

export interface ResourceDeliveryEvidence {
  id: string;
  organizationId: string;
  deliveryId: string;
  caption?: string;
  storageRef: string;
  /** URL pública resuelta del `storageRef` (StoragePort) — lista para mostrar
   *  directamente, sin que el cliente tenga que construirla. */
  url: string;
  order: number;
  createdAt: string;
}

export interface CreateResourceDeliveryEvidenceInput {
  caption?: string;
  filename: string;
  contentType?: string;
  order?: number;
}

/** Devuelto al crear evidencia: la fila más el destino para subir los bytes. */
export interface ResourceDeliveryEvidenceUploadResult {
  evidence: ResourceDeliveryEvidence;
  upload: { url: string; key: string };
}
