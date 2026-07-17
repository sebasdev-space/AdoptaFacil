import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Transparency indicator data (§M14 — principio de transparencia).
 *
 * The persistent header indicator "Nivel · % formalización · rendición" must be
 * present in every portal module. This context supplies its data. In Ola 0 the
 * values are **placeholder/simulated**; Ola 1 wires this provider to the real
 * portals/dashboards data (the `portals` contract) with no change to consumers.
 */
export type AccountabilityState = 'al-dia' | 'pendiente' | 'atrasada';

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
};
