/**
 * Historial de listados de gestión (M04 solicitudes de adopción, M05 donaciones
 * recibidas). Parámetros OPCIONALES y ADITIVOS: sin parámetros el endpoint sigue
 * devolviendo un array directo, ahora limitado a los últimos
 * {@link HISTORY_DEFAULT_DAYS} días. Con `page` (el "Ver todo") responde un
 * {@link HistoryPage}. Tiempos ISO-8601 en UTC; la hora Colombia es solo UI.
 */

/** Ventana por defecto del historial, en días (hallazgo del cliente). */
export const HISTORY_DEFAULT_DAYS = 30;
/** Tamaño de página por defecto del "Ver todo". */
export const HISTORY_DEFAULT_PAGE_SIZE = 25;
/** Tope duro de `pageSize`. */
export const HISTORY_MAX_PAGE_SIZE = 100;
/** Tope de filas del modo array (sin `page`) — evita listados sin límite. */
export const HISTORY_ARRAY_CAP = 500;

/** Query opcional de los listados con historial. */
export interface HistoryQuery<S extends string = string> {
  /** ISO-8601 UTC, inclusivo. */
  from?: string;
  /** ISO-8601 UTC, inclusivo. */
  to?: string;
  status?: S;
  /** 1-based. Su presencia activa el modo paginado (sobre) y desactiva el default de 30 días. */
  page?: number;
  pageSize?: number;
}

/** Respuesta del modo paginado. */
export interface HistoryPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
