// Transparency indicator layer of the app shell (§M14).
export {
  TransparencyProvider,
  useTransparency,
  ACCOUNTABILITY_LABELS,
  ACCOUNTABILITY_INTEGRATION_POINT,
  deriveFormalizationPct,
  deriveTransparency,
  type TransparencyData,
  type TransparencyStatus,
  type TransparencySource,
  type AccountabilityState,
  type TransparencyProviderProps,
} from './transparency-context';
export { TransparencyIndicator, type TransparencyIndicatorProps } from './transparency-indicator';
