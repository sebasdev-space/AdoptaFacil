/**
 * DianPort (hexagonal, invariante #5 de CLAUDE.md) — verificación de estado
 * RUT/RTE ante la DIAN (S-2, RF02 relacionado / RNF07).
 *
 * El documento base es explícito: **"DIAN: SIN API"** — no existe integración
 * oficial. La calificación RTE y su renovación anual son trámites CON
 * intervención humana; este puerto y su único adaptador (fake) NO simulan ese
 * trámite real, solo dan a la máquina de estados de formalización un punto de
 * extensión honesto y ya simulable mientras ese trámite ocurre fuera del
 * sistema. TODO(client): la integración real (scraping del portal de la DIAN,
 * un servicio de terceros, o carga manual de evidencia por el Owner) no está
 * definida por el documento base — no se inventa aquí.
 */
export const DIAN_PORT = Symbol('DIAN_PORT');

export interface DianVerificationResult {
  verified: boolean;
}

export interface DianPort {
  /** Verifica el estado RUT/RTE de la organización por NIT. El NIT NUNCA se
   *  persiste ni se audita en claro (ver DianVerificationAttempt) — es un
   *  parámetro transitorio de esta llamada únicamente. */
  verifyRteStatus(nit: string): Promise<DianVerificationResult>;
}
