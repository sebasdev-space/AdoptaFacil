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
