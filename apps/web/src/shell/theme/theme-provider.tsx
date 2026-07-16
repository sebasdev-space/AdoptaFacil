import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * App-shell theme controller for the AdoptaFácil design tokens (§M14).
 *
 * Flips the `dark` class on <html>, which is what the @adoptafacil/ui token set
 * keys off. State is held in memory only — NO localStorage/sessionStorage (per
 * T-020). If durable persistence is ever wanted it plugs in here via
 * `defaultTheme` + an `onThemeChange` side effect, defined separately.
 */
export type Theme = 'light' | 'dark' | 'system';
/** The concrete theme actually applied to the DOM (never 'system'). */
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  /** The user's selection, including 'system'. */
  theme: Theme;
  /** What is actually painted right now ('light' | 'dark'). */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  /** Toggle between light and dark (resolves 'system' first). */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const isBrowser = typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function systemPrefersDark(): boolean {
  return isBrowser && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Initial selection when the app boots. Defaults to following the OS. */
  defaultTheme?: Theme;
  /** Optional hook for wiring persistence later (called on every change). */
  onThemeChange?: (theme: Theme) => void;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  onThemeChange,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve(defaultTheme));

  // Apply the resolved theme to <html> and keep it in sync with the selection.
  useEffect(() => {
    const applied = resolve(theme);
    setResolvedTheme(applied);
    if (isBrowser) {
      document.documentElement.classList.toggle('dark', applied === 'dark');
    }
  }, [theme]);

  // When following the system, react to OS-level changes live.
  useEffect(() => {
    if (theme !== 'system' || !isBrowser) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const applied = media.matches ? 'dark' : 'light';
      setResolvedTheme(applied);
      document.documentElement.classList.toggle('dark', applied === 'dark');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      onThemeChange?.(next);
    },
    [onThemeChange],
  );

  const toggleTheme = useCallback(() => {
    setTheme(resolve(theme) === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Read/control the current theme. Throws if used outside <ThemeProvider>. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return context;
}
