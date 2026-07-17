/**
 * §M14 — runtime personalization by CSS tokens.
 *
 * The source of truth for token *values* is @adoptafacil/ui/styles.css. This
 * module is the typed contract for overriding them at runtime (e.g. per-tenant
 * branding) without touching component code. Overrides are applied to an element
 * as inline CSS custom properties and cascade to every component beneath it.
 */

/** Color tokens carry bare HSL channels, e.g. "142 72% 29%". */
export type ColorToken =
  | 'background'
  | 'foreground'
  | 'card'
  | 'card-foreground'
  | 'popover'
  | 'popover-foreground'
  | 'primary'
  | 'primary-foreground'
  | 'secondary'
  | 'secondary-foreground'
  | 'muted'
  | 'muted-foreground'
  | 'accent'
  | 'accent-foreground'
  | 'destructive'
  | 'destructive-foreground'
  | 'success'
  | 'success-foreground'
  | 'warning'
  | 'warning-foreground'
  | 'info'
  | 'info-foreground'
  | 'border'
  | 'input'
  | 'ring';

/** Non-color tokens carry full CSS values (font stacks, lengths). */
export type ScalarToken = 'font-sans' | 'font-display' | 'font-mono' | 'radius' | 'ring-offset';

export type BrandTokens = Partial<Record<ColorToken | ScalarToken, string>>;

/**
 * Turn a token map into a style object of `--token` custom properties, suitable
 * for a React `style` prop or `element.style`.
 *
 *   <div style={brandTokensToStyle({ primary: '24 90% 50%' })}>…</div>
 */
export function brandTokensToStyle(tokens: BrandTokens): Record<string, string> {
  return Object.fromEntries(Object.entries(tokens).map(([key, value]) => [`--${key}`, value]));
}

/**
 * Apply token overrides directly to an element (default: <html>), so the whole
 * app rebrands live. Pass `null`/`undefined` value to clear a single token.
 */
export function applyBrandTokens(
  tokens: BrandTokens,
  target: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null,
): void {
  if (!target) return;
  for (const [key, value] of Object.entries(tokens)) {
    if (value == null) target.style.removeProperty(`--${key}`);
    else target.style.setProperty(`--${key}`, value);
  }
}
