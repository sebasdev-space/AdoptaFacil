/**
 * Pure resolver for real portal subdomains (F-1, M14): given the CURRENT
 * browser hostname and the configured base domain (`VITE_PORTAL_BASE_DOMAIN`),
 * decides whether the app is being served from an organization's own
 * subdomain (`<subdomain>.<baseDomain>`) — and if so, extracts the label.
 *
 * Every other host resolves to `null` — including the bare base domain itself,
 * reserved infrastructure labels (`www`, `app`, `api`, `admin`, `staging`), and
 * anything that doesn't end in the base domain at all (localhost, staging
 * preview URLs, IP addresses). `null` means "render the app exactly as
 * today" — no subdomain routing kicks in.
 */

const RESERVED_LABELS = new Set(['www', 'app', 'api', 'admin', 'staging']);

/** `hostname` from `window.location`; `baseDomain` from `VITE_PORTAL_BASE_DOMAIN`
 *  (unset in dev/staging by default — subdomain detection then never triggers). */
export function resolveOrgSubdomain(
  hostname: string,
  baseDomain: string | undefined,
): string | null {
  if (!baseDomain) return null;

  const host = hostname.trim().toLowerCase();
  const base = baseDomain.trim().toLowerCase();
  if (!host || !base || host === base) return null;

  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return null;

  const label = host.slice(0, -suffix.length);
  // Nested subdomains (e.g. "a.b.<base>") aren't a supported shape yet —
  // treat them as "not a portal subdomain" rather than guessing which label
  // is the organization's.
  if (!label || label.includes('.') || RESERVED_LABELS.has(label)) return null;

  return label;
}
