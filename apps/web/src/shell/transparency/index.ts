// Transparency indicator layer of the app shell (§M14).
export {
  TransparencyProvider,
  SessionTransparencyProvider,
  useTransparency,
  ACCOUNTABILITY_LABELS,
  ACCOUNTABILITY_INTEGRATION_POINT,
  deriveFormalizationPct,
  deriveTransparency,
  deriveTransparencyStatus,
  type TransparencyData,
  type TransparencyStatus,
  type TransparencySource,
  type SessionTransparencyInput,
  type AccountabilityState,
  type TransparencyProviderProps,
} from './transparency-context';
export { TransparencyIndicator, type TransparencyIndicatorProps } from './transparency-indicator';
