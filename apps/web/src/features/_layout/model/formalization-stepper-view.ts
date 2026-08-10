import { FORMALIZATION_SEQUENCE, FormalizationState } from '@adoptafacil/contracts';
import type { ProgressStep } from '@adoptafacil/ui';

/** Etiquetas legibles (es-CO) del estado de formalización (§14, RF02) — mismo
 *  mapeo ya usado en org-formalization-page/org-profile-page/portal-profile-section. */
const FORMALIZATION_LABELS: Record<FormalizationState, string> = {
  [FormalizationState.Informal]: 'Informal',
  [FormalizationState.EnProceso]: 'En proceso',
  [FormalizationState.Formalizada]: 'Formalizada',
  [FormalizationState.ESAL]: 'ESAL',
  [FormalizationState.ESAL_RTE]: 'ESAL + RTE',
};

/**
 * `GET /org/summary` (S2-08) only returns `formalizationPercent` — not the raw
 * `FormalizationState` — so the stepper's current step is the INVERSE of
 * `deriveFormalizationPct` (index/(length-1) → percent), rounded to the
 * nearest step. Same finite 5-state sequence, no new data invented.
 */
export function formalizationStepIndex(percent: number): number {
  return Math.round((percent / 100) * (FORMALIZATION_SEQUENCE.length - 1));
}

export function formalizationSteps(): ProgressStep[] {
  return FORMALIZATION_SEQUENCE.map((state) => ({
    key: state,
    label: FORMALIZATION_LABELS[state],
  }));
}
