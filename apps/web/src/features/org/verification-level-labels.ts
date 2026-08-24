/**
 * Etiquetas de nivel de verificación (S1-05) — MISMOS textos que
 * `apps/api/src/modules/org/verification.ts` (`level: 1 "Básico"`, `2
 * "Verificado"`, `3 "Confiable"`, `4 "Máxima confianza"`), duplicados aquí
 * porque el backend no puede importar código de `apps/web` (mismo criterio
 * ya usado por `formalizationPercent` en `packages/contracts/src/dashboards.ts`,
 * solo que en la dirección inversa). Nivel 0 no tiene entrada propia en el
 * backend (ausencia de nivel) — se etiqueta aquí como "Sin verificar".
 */
export const VERIFICATION_LEVEL_LABELS: Record<number, string> = {
  0: 'Sin verificar',
  1: 'Básico',
  2: 'Verificado',
  3: 'Confiable',
  4: 'Máxima confianza',
};
