import { Button, type ButtonProps } from '@adoptafacil/ui';
import { useTheme } from './theme-provider';

export type ThemeToggleProps = Omit<ButtonProps, 'onClick' | 'children'>;

/**
 * Ready-to-use light/dark switch wired to the ThemeProvider. Labelled for
 * assistive tech and reflects the current state via `aria-pressed`.
 */
export function ThemeToggle({ variant = 'outline', size = 'sm', ...props }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant={variant}
      size={size}
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      {...props}
    >
      <span aria-hidden>{isDark ? '☀️' : '🌙'}</span>
      <span className="ml-2">{isDark ? 'Claro' : 'Oscuro'}</span>
    </Button>
  );
}
