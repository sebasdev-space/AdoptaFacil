import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  FORMALIZATION_SEQUENCE,
  type FormalizationState,
  type PortalAccountabilityStatus,
  type VerificationLevel,
} from '@adoptafacil/contracts';
import { useSession } from '../auth';

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
  | { status: 'error'; message: string }
  // No indicator to show — no session, or an account with no org transparency
  // (e.g. a person account). The indicator renders nothing (T-029).
  | { status: 'hidden' };

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

/** Inputs the shell session exposes for the indicator (T-029). */
export interface SessionTransparencyInput {
  /** Whether there is an authenticated session at all. */
  authenticated: boolean;
  /** Loading state of the org transparency source (session-owned, once/session). */
  sourceStatus: 'idle' | 'loading' | 'ready' | 'error';
  /** The real source, when loaded. */
  source: TransparencySource | null;
}

/**
 * Map the session's transparency state to the indicator's render state (T-029).
 * Pure (no React) so it is unit-tested directly:
 *   - no session, or 'idle' (a non-org account) → hidden.
 *   - 'loading' → loading; 'error' → error; 'ready' → real DERIVED data.
 */
export function deriveTransparencyStatus(input: SessionTransparencyInput): TransparencyStatus {
  if (!input.authenticated || input.sourceStatus === 'idle') return { status: 'hidden' };
  if (input.sourceStatus === 'loading') return { status: 'loading' };
  if (input.sourceStatus === 'error') {
    return { status: 'error', message: 'Indicador de transparencia no disponible' };
  }
  return { status: 'ready', data: deriveTransparency(input.source ?? {}) };
}

/**
 * Connects the persistent indicator to REAL session data (T-029). Reads the
 * transparency source the session loaded ONCE at establishment (never per
 * render) and feeds the pure {@link TransparencyProvider}. The app mounts this
 * instead of a hardcoded placeholder; tests may still mount `TransparencyProvider`
 * with an explicit value.
 */
export function SessionTransparencyProvider({ children }: { children: ReactNode }) {
  const { status, transparencyStatus, transparencySource } = useSession();
  const value = useMemo<TransparencyStatus>(
    () =>
      deriveTransparencyStatus({
        authenticated: status === 'authenticated',
        sourceStatus: transparencyStatus,
        source: transparencySource,
      }),
    [status, transparencyStatus, transparencySource],
  );
  return <TransparencyProvider value={value}>{children}</TransparencyProvider>;
}
