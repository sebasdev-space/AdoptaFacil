// AdoptaFácil app-shell theme layer. Public surface for the web app.
export {
  ThemeProvider,
  useTheme,
  type Theme,
  type ResolvedTheme,
  type ThemeProviderProps,
} from './theme-provider';
export { ThemeToggle, type ThemeToggleProps } from './theme-toggle';
export {
  applyBrandTokens,
  brandTokensToStyle,
  type BrandTokens,
  type ColorToken,
  type ScalarToken,
} from './tokens';
