/**
 * Responsive breakpoints for the app shell (§M14 — escritorio/tablet/móvil).
 *
 * Aligned with the Tailwind preset shipped by @adoptafacil/ui so the layout and
 * any JS-driven responsive logic share a single source of truth:
 *
 *   - móvil     : < 768px   → sidebar collapses to an off-canvas drawer
 *   - tablet    : 768–1023  → drawer, roomier content, condensed indicator
 *   - escritorio: ≥ 1024px  → persistent sidebar alongside the content
 *
 * The `lg` boundary (1024) is where the persistent sidebar appears; below it the
 * navigation is a drawer toggled from the header. These match Tailwind's default
 * `md`/`lg` tokens used throughout the layout classNames.
 */
export const BREAKPOINTS = {
  /** Tablet and up. */
  md: 768,
  /** Desktop and up — persistent sidebar. */
  lg: 1024,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/** Media query that matches viewports at/above the persistent-sidebar width. */
export const DESKTOP_QUERY = `(min-width: ${BREAKPOINTS.lg}px)`;
