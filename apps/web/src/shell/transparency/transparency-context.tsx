import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  FORMALIZATION_SEQUENCE,
  type FormalizationState,
  type PortalAccountabilityStatus,
  type VerificationLevel,
} from '@adoptafacil/contracts';

/**
 * Transparency indicator data (§M14 — principio de transparencia).
 *
 * The persistent header indicator "Nivel · % formalización · rendición" must be
 * present in every portal module. This context supplies its data. In Ola 0 the
 * values are **placeholder/simulated**; Ola 1 (T-027) wires it to REAL data
 * derived from the `org` contract (see {@link deriveTransparency}) with no change
 * to consumers.
 */
export type AccountabilityState = PortalAccountabilityStatus;

export interface TransparencyData {
  /** Formalization/trust tier of the current org or portal (1–5). */
  level: number;
  /** Percentage of the formalization checklist completed (0–100). */
  formalizationPct: number;
  /** State of accountability reporting ("rendición de cuentas"). */
  accountability: AccountabilityState;
}

export type TransparencyStatus =
  | { status: 'loading' }
  | { status: 'ready'; data: TransparencyData }
  | { status: 'error'; message: string };

const TransparencyContext = createContext<TransparencyStatus | undefined>(undefined);

/** Simulated values until the real portals data lands in Ola 1. */
const PLACEHOLDER: TransparencyData = {
  level: 3,
  formalizationPct: 82,
  accountability: 'al-dia',
};

export interface TransparencyProviderProps {
  children: ReactNode;
  /**
   * Override the indicator state. Defaults to a ready placeholder; Ola 1 will
   * pass live data (or loading/error) sourced from the API here.
   */
  value?: TransparencyStatus;
}

export function TransparencyProvider({
  children,
  value = { status: 'ready', data: PLACEHOLDER },
}: TransparencyProviderProps) {
  const memoized = useMemo<TransparencyStatus>(() => value, [value]);
  return <TransparencyContext.Provider value={memoized}>{children}</TransparencyContext.Provider>;
}

/** Read the transparency indicator state. Throws if used outside its provider. */
export function useTransparency(): TransparencyStatus {
  const context = useContext(TransparencyContext);
  if (context === undefined) {
    throw new Error('useTransparency must be used within a <TransparencyProvider>');
  }
  return context;
}

export const ACCOUNTABILITY_LABELS: Record<AccountabilityState, string> = {
  'al-dia': 'Al día',
  pendiente: 'Pendiente',
  atrasada: 'Atrasada',
  'no-disponible': 'No disponible',
};

/**
 * Punto de integración de la rendición de cuentas. Hoy la rendición es un
 * PLACEHOLDER tipado (`accountability: 'no-disponible'`): no se calcula con datos
 * inventados. Se cableará cuando existan campañas/donaciones (M05/M06).
 */
export const ACCOUNTABILITY_INTEGRATION_POINT =
  'M05 campañas / M06 donaciones · rendición de cuentas (pendiente)';

/**
 * Deriva el % de formalización de la POSICIÓN del estado en FORMALIZATION_SEQUENCE
 * (0–100): Informal = 0%, …, ESAL_RTE = 100%.
 *
 * DECISIÓN DEL DOCUMENTO BASE (§M14), REVISABLE: no es una métrica nueva, es la
 * posición del estado sobre el número de pasos de la secuencia canónica de
 * formalización (índice / (total − 1)). Si @sebastian ajusta la secuencia, este
 * porcentaje la sigue por contrato sin tocar consumidores.
 */
export function deriveFormalizationPct(state: FormalizationState): number {
  const index = FORMALIZATION_SEQUENCE.indexOf(state);
  if (index < 0 || FORMALIZATION_SEQUENCE.length <= 1) return 0;
  return Math.round((index / (FORMALIZATION_SEQUENCE.length - 1)) * 100);
}

/** Fuente real para derivar el indicador (subconjunto del contrato de `org`). */
export interface TransparencySource {
  verificationLevel?: VerificationLevel;
  formalizationState?: FormalizationState;
}

/**
 * Construye los datos REALES del indicador desde el contrato de `org`:
 *   - `level`            ← VerificationLevel.level (0 si no hay verificación).
 *   - `formalizationPct` ← DERIVADO de FORMALIZATION_SEQUENCE.
 *   - `accountability`   ← PLACEHOLDER tipado ('no-disponible') hasta M05/M06.
 */
export function deriveTransparency(source: TransparencySource): TransparencyData {
  return {
    level: source.verificationLevel?.level ?? 0,
    formalizationPct: source.formalizationState
      ? deriveFormalizationPct(source.formalizationState)
      : 0,
    // La rendición NO se inventa: placeholder explícito con punto de integración.
    accountability: 'no-disponible',
  };
}
