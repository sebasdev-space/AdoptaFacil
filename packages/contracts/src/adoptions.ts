// Module: M04 adoptions · Contracts owner: @fabian
//
// Adoption request + evaluation (T-028a, §M04, RF10). First vertical cut:
//   - an authenticated PERSON applies to adopt a specific animal, and
//   - the owning organization evaluates the request on a kanban
//     (new → in_review → approved | rejected) with AUDITED transitions.
//
// SÓLO TIPOS (@adoptafacil/contracts se compila a CJS/ESM; los VALORES en runtime
// —máquina de estados, validación— viven en la api y en la feature web). El animal
// se referencia por contrato (`AnimalSummary`), NO se accede a las tablas de M03.
//
// Puntos de integración TIPADOS que este corte deja listos, sin implementar:
//   - `contractRef`  → T-028b (contrato/firma de adopción).
//   - `trackingRef`  → T-028c (seguimiento post-adopción).
//   - navegación pública del catálogo de animales adoptables → depende de que M03
//     publique `GET /public/organizations/:slug/animals` (dominio de @sebastian).
import type { AnimalSpecies } from './animals';

/**
 * Estado de una solicitud de adopción (§M04). Flujo del tablero:
 *   `new` (Nueva) → `in_review` (En evaluación) → `approved` | `rejected`.
 * `approved`/`rejected` son terminales.
 */
export type AdoptionStatus = 'new' | 'in_review' | 'approved' | 'rejected';

/** Valores permitidos, para validación y UI (columnas del kanban). */
export const ADOPTION_STATUSES: readonly AdoptionStatus[] = [
  'new',
  'in_review',
  'approved',
  'rejected',
];

/**
 * Longitud mínima del mensaje del solicitante (RF10): obliga a una postulación
 * argumentada, no un clic. Es una decisión del documento base.
 */
export const ADOPTION_MESSAGE_MIN_LENGTH = 50;

/**
 * Datos de contacto del solicitante (persona autenticada). Dato personal bajo
 * Ley 1581: se almacena en el tenant de la organización (RLS), auditado, y NUNCA
 * se registra en claro en la auditoría.
 */
export interface AdoptionApplicant {
  fullName: string;
  email: string;
  phone?: string;
}

/**
 * Snapshot mínimo del animal capturado al crear la solicitud, para que el kanban
 * renderice sin depender de la disponibilidad de M03. La FUENTE DE VERDAD del
 * animal sigue siendo M03 (`AnimalSummary`); esto es solo una copia de conveniencia.
 */
export interface AdoptionAnimalSnapshot {
  animalId: string;
  name: string;
  species: AnimalSpecies;
  photoUrl?: string;
}

/**
 * Solicitud de adopción (§M04, RF10). Vive en el tenant de la organización dueña
 * del animal (multi-tenant + RLS). Creada por una PERSONA autenticada; evaluada
 * por la organización.
 */
export interface AdoptionRequest {
  id: string;
  /** Organización dueña del animal (ancla de tenant). */
  organizationId: string;
  /**
   * Nombre de la organización dueña del animal. Ausente en la mayoría de las
   * rutas (la org ya conoce su propio nombre); `GET /adoptions/mine` (F1-01) lo
   * resuelve para que la bandeja "Mis solicitudes" de la Persona no tenga que
   * hacer una consulta aparte por cada solicitud — mismo patrón que
   * `organizationName` en {@link Donation} (`GET /donations/mine`, S1-02).
   */
  organizationName?: string;
  /** Referencia al animal en M03 (por id; sin FK Prisma cross-módulo). */
  animalId: string;
  /** Copia de conveniencia para el tablero (fuente de verdad = M03). */
  animalSnapshot: AdoptionAnimalSnapshot;
  /** Usuario (persona) que postuló. */
  applicantUserId: string;
  /** Contacto del solicitante (Ley 1581). */
  applicant: AdoptionApplicant;
  /** Mensaje/motivación (≥ {@link ADOPTION_MESSAGE_MIN_LENGTH} caracteres). */
  message: string;
  status: AdoptionStatus;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
  // --- Puntos de integración tipados (no implementados en T-028a) ------------
  /** T-028b — referencia al contrato/firma de adopción, cuando exista. */
  contractRef?: string;
  /** T-028c — referencia al seguimiento post-adopción, cuando exista. */
  trackingRef?: string;
}

/** Proyección mínima para las tarjetas del kanban de evaluación. */
export interface AdoptionRequestSummary {
  id: string;
  animalId: string;
  animalName: string;
  applicantName: string;
  status: AdoptionStatus;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/**
 * Entrada para crear una solicitud (persona autenticada). `organizationId` y
 * `animalSnapshot` provienen del catálogo público del portal (integración M03);
 * el backend fija `applicantUserId` desde el JWT (nunca del cliente).
 */
export interface CreateAdoptionRequestInput {
  animalId: string;
  organizationId: string;
  animalSnapshot: AdoptionAnimalSnapshot;
  applicant: AdoptionApplicant;
  message: string;
}

/** Entrada para mover una solicitud de estado (evaluación por la organización). */
export interface TransitionAdoptionRequestInput {
  targetStatus: AdoptionStatus;
  /** Motivo (recomendado; útil para rechazo). Nunca datos sensibles. */
  reason?: string;
}

// ============================================================================
// T-028b · Contrato de adopción + firma electrónica (§M04, RF11)
//
// Materializa el seam `contractRef` de T-028a: tras APROBAR una solicitud, la
// organización genera un contrato con firmantes DINÁMICOS, cada firmante firma
// su parte vía un puerto SIMULABLE (`SignaturePort`), y al completarse todas las
// firmas se calcula el hash del payload canónico y el contrato se sella INMUTABLE
// (versionamiento documental, RNF05). El seguimiento post-adopción es T-028c.
//
// Marco legal declarado (RNF10): Ley 527/1999 (validez de la firma electrónica y
// del comercio electrónico) y Ley 1581/2012 (protección de datos personales).
// Tiempos ISO-8601 en UTC (RNF11); la hora Colombia es solo de presentación.
// ============================================================================

/**
 * Ley aplicable DECLARADA en todo contrato de adopción (RNF10): validez de la
 * firma electrónica (Ley 527/1999) y protección de datos personales (Ley
 * 1581/2012). Forma parte del payload canónico que se sella por hash.
 */
export const ADOPTION_CONTRACT_APPLICABLE_LAWS = ['Ley 527/1999', 'Ley 1581/2012'] as const;
export type AdoptionContractLaw = (typeof ADOPTION_CONTRACT_APPLICABLE_LAWS)[number];

/**
 * Estado del contrato (§M04, RF11):
 *   `draft` → `pending_signatures` → `signed` (TERMINAL, inmutable).
 *   `draft` | `pending_signatures` → `cancelled` (nunca desde `signed`).
 */
export type AdoptionContractStatus = 'draft' | 'pending_signatures' | 'signed' | 'cancelled';

export const ADOPTION_CONTRACT_STATUSES: readonly AdoptionContractStatus[] = [
  'draft',
  'pending_signatures',
  'signed',
  'cancelled',
];

/**
 * Rol de un firmante. Firmantes DINÁMICOS: como mínimo el representante de la
 * organización y el adoptante; se pueden añadir testigos u otros.
 */
export type AdoptionSignerRole = 'organization_representative' | 'adopter' | 'witness';

/**
 * Un firmante del contrato (parte de la lista dinámica). `signedAt`/`signatureId`
 * se rellenan cuando esa parte firma (vía {@link SignaturePort}).
 */
export interface AdoptionContractSigner {
  /** Id estable del firmante dentro del contrato. */
  id: string;
  role: AdoptionSignerRole;
  /** Dato personal (Ley 1581): nunca se registra en claro en auditoría. */
  fullName: string;
  email: string;
  /** Usuario autenticado que firma esta parte (adoptante = `applicantUserId`). */
  userId?: string;
  /** ISO-8601 UTC en que firmó (ausente si pendiente). */
  signedAt?: string;
  /** Id de la firma emitido por el {@link SignaturePort} (ausente si pendiente). */
  signatureId?: string;
}

/** Firmante propuesto al generar (sin estado de firma todavía). */
export interface AdoptionContractSignerInput {
  role: AdoptionSignerRole;
  fullName: string;
  email: string;
  userId?: string;
}

/**
 * Contenido CANÓNICO y versionable del contrato: es exactamente lo que se serializa
 * de forma determinista y se sella por hash (RNF05). No incluye el estado de las
 * firmas (esas se acumulan aparte); sellar congela este contenido.
 */
export interface AdoptionContractPayload {
  requestId: string;
  organizationId: string;
  animalId: string;
  animal: AdoptionAnimalSnapshot;
  /** Dato personal del adoptante (Ley 1581). */
  applicant: AdoptionApplicant;
  /** Ley aplicable declarada (RNF10). */
  applicableLaws: readonly AdoptionContractLaw[];
  /** Cláusulas del contrato (parametrizable por el cliente; TODO(client)). */
  terms: string;
}

/**
 * Contrato de adopción (§M04, RF11). Vive en el tenant de la organización dueña
 * del animal (multi-tenant + RLS). Se genera desde una solicitud `approved`;
 * inmutable tras `signed` (payload sellado por {@link AdoptionContract.contentHash}).
 */
export interface AdoptionContract {
  id: string;
  /** Organización dueña del animal (ancla de tenant). */
  organizationId: string;
  /** Solicitud aprobada que originó el contrato (seam `contractRef` de T-028a). */
  requestId: string;
  animalId: string;
  /** Versión documental (RNF05); `1` en el primer corte. */
  version: number;
  status: AdoptionContractStatus;
  /** Firmantes dinámicos (≥ representante de la org + adoptante). */
  signers: AdoptionContractSigner[];
  /** Contenido canónico (fuente del hash). */
  payload: AdoptionContractPayload;
  /** SHA-256 hex del payload canónico; presente SOLO cuando `signed`. */
  contentHash?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
  /** ISO-8601 UTC del sellado (presente cuando `signed`). */
  signedAt?: string;
}

/** Proyección mínima para listar/mostrar contratos junto al kanban. */
export interface AdoptionContractSummary {
  id: string;
  requestId: string;
  animalId: string;
  status: AdoptionContractStatus;
  version: number;
  /** Nº de firmantes que ya firmaron / total. */
  signedCount: number;
  signerCount: number;
  contentHash?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/**
 * Entrada para GENERAR el contrato de una solicitud aprobada. El representante de
 * la organización y el adoptante se derivan del actor y de la solicitud; aquí solo
 * se pueden añadir firmantes extra (p. ej. testigos) y las cláusulas.
 */
export interface GenerateAdoptionContractInput {
  /** Solicitud APROBADA para la que se genera el contrato. */
  requestId: string;
  additionalSigners?: AdoptionContractSignerInput[];
  /** Cláusulas del contrato (parametrizable; TODO(client)). */
  terms?: string;
}

/** Entrada para mover el contrato entre los estados que gestiona la organización. */
export interface TransitionAdoptionContractInput {
  targetStatus: Extract<AdoptionContractStatus, 'pending_signatures' | 'cancelled'>;
  /** Motivo (recomendado para cancelación). Nunca datos sensibles. */
  reason?: string;
}

/** Entrada para firmar una parte: el firmante identificado por `signerId`. */
export interface SignAdoptionContractInput {
  signerId: string;
}

// --- SignaturePort (puerto SIMULABLE; interfaz publicada, wiring en la api) ---

/**
 * Petición de firma electrónica (Ley 527/1999) enviada al {@link SignaturePort}.
 * `documentHash` es el hash del payload canónico que el firmante atestigua.
 */
export interface AdoptionSignatureRequest {
  contractId: string;
  signerId: string;
  signerRole: AdoptionSignerRole;
  documentHash: string;
}

/** Resultado de una firma electrónica emitida por el {@link SignaturePort}. */
export interface AdoptionSignatureResult {
  signatureId: string;
  /** ISO-8601 UTC. */
  signedAt: string;
  /** Adaptador que emitió la firma (p. ej. `'fake-local'` en Ola 1). */
  provider: string;
}

/**
 * Puerto SIMULABLE de firma electrónica (hexagonal), LOCAL al módulo de adopciones
 * (no vive en core/). Ola 1: adaptador fake determinista; los proveedores reales
 * (Ley 527/1999) llegan detrás de esta MISMA interfaz sin tocar a los consumidores.
 */
export interface SignaturePort {
  sign(request: AdoptionSignatureRequest): Promise<AdoptionSignatureResult>;
}

// ============================================================================
// T-028c · Seguimiento post-adopción (§M04, RF12) — CIERRE de M04
//
// Materializa el seam `trackingRef` de T-028a: a partir de un contrato `signed`
// (T-028b) la organización programa HITOS de seguimiento (con fecha y cuestionario);
// el adoptante responde el cuestionario y sube evidencias (fotos) de SU adopción; un
// worker marca los hitos vencidos como `overdue` y emite una alerta. Sin IA de riesgo
// de abandono (diferida) y sin canales de notificación nuevos (reusa NotificationPort).
//
// Evidencias/fotos: StoragePort (core, por token). Alertas: NotificationPort + la
// cola BullMQ global. Tiempos ISO-8601 en UTC (RNF11); hora Colombia solo en UI.
// Datos personales del adoptante (Ley 1581): tenant-scoped (RLS), sin PII en claro
// en auditoría.
// ============================================================================

/**
 * Estado de un hito de seguimiento (§M04, RF12):
 *   `scheduled` → `completed` | `overdue`   (`completed` es TERMINAL).
 * Un hito `overdue` aún puede completarse tarde (`overdue` → `completed`). La alerta
 * se dispara al pasar a `overdue`.
 */
export type FollowUpMilestoneStatus = 'scheduled' | 'completed' | 'overdue';

export const FOLLOWUP_MILESTONE_STATUSES: readonly FollowUpMilestoneStatus[] = [
  'scheduled',
  'completed',
  'overdue',
];

/** Tipo de pregunta del cuestionario de un hito. */
export type FollowUpQuestionKind = 'text' | 'boolean' | 'photo';

export interface FollowUpQuestion {
  id: string;
  prompt: string;
  kind: FollowUpQuestionKind;
  required?: boolean;
}

/** Tipo de evidencia asociada a un hito. */
export type FollowUpEvidenceKind = 'photo' | 'questionnaire';

/**
 * Evidencia de un hito (foto vía StoragePort y/o respuestas del cuestionario).
 * `answers` es dato personal (Ley 1581): nunca se registra en claro en auditoría.
 */
export interface AdoptionFollowUpEvidence {
  id: string;
  milestoneId: string;
  kind: FollowUpEvidenceKind;
  answers?: Record<string, unknown>;
  /** URL pública de la foto (resuelta por el StoragePort), si aplica. */
  photoUrl?: string;
  /** Clave opaca de almacenamiento (StoragePort), si aplica. */
  storageRef?: string;
  submittedByUserId: string;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/**
 * Hito de seguimiento post-adopción (§M04, RF12). Vive en el tenant de la
 * organización dueña del animal (multi-tenant + RLS). Se programa a partir de un
 * contrato `signed`; el adoptante responde/sube evidencia de SU adopción.
 */
export interface AdoptionFollowUpMilestone {
  id: string;
  organizationId: string;
  /** Contrato firmado que habilita el seguimiento (seam `trackingRef`). */
  contractId: string;
  requestId: string;
  /** Adoptante responsable (gate de identidad para responder). */
  adopterUserId: string;
  /** Dato personal del adoptante (Ley 1581). */
  adopterName: string;
  adopterEmail: string;
  title: string;
  questionnaire: FollowUpQuestion[];
  /** ISO-8601 UTC del vencimiento. */
  dueAt: string;
  status: FollowUpMilestoneStatus;
  /** ISO-8601 UTC (presente cuando `completed`). */
  completedAt?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
  /** Evidencias asociadas (fotos/cuestionarios). */
  evidence: AdoptionFollowUpEvidence[];
}

/** Pregunta propuesta al programar (el backend asigna `id` si falta). */
export interface FollowUpQuestionInput {
  id?: string;
  prompt: string;
  kind: FollowUpQuestionKind;
  required?: boolean;
}

/** Entrada para PROGRAMAR un hito sobre un contrato firmado (rol de organización). */
export interface ScheduleFollowUpMilestoneInput {
  contractId: string;
  title: string;
  /** ISO-8601 UTC del vencimiento. */
  dueAt: string;
  questionnaire?: FollowUpQuestionInput[];
}

/**
 * Entrada para que el ADOPTANTE responda un hito: respuestas del cuestionario y/o
 * una foto (subida vía StoragePort). Por defecto marca el hito como completado.
 */
export interface SubmitFollowUpInput {
  answers?: Record<string, unknown>;
  /** Nombre de archivo de la foto a subir (StoragePort); opcional. */
  photoFilename?: string;
  /** Marcar el hito como completado (por defecto `true`). */
  complete?: boolean;
}
