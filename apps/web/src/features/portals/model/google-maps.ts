/**
 * Google Maps URL → embed URL (S2-REORG). Fixes the public portal's
 * "Información" iframe showing "refused to connect": Google Maps blocks
 * framing of its normal share/place URLs — only `/maps/embed?...` or
 * `?output=embed` URLs are embeddable. This is a best-effort, pure
 * string transform (no Maps API/key) — when it can't confidently produce an
 * embeddable URL, the caller falls back to a plain "Ver en mapa →" link
 * instead of risking another blocked iframe.
 */

const GOOGLE_MAPS_HOSTS = /(^|\.)google\.[a-z.]+$/i;
const MAPS_GOOGLE_HOSTS = /(^|\.)maps\.google\.[a-z.]+$/i;

/** Is this a google.com/maps or maps.google.com URL at all? */
export function isGoogleMapsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (MAPS_GOOGLE_HOSTS.test(url.hostname)) return true;
    return GOOGLE_MAPS_HOSTS.test(url.hostname) && url.pathname.startsWith('/maps');
  } catch {
    return false;
  }
}

/** `/maps/place/Some+Place/@4.6,-74.1,15z` → "Some Place". */
function placeFromPath(pathname: string): string | null {
  const match = /\/maps\/place\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : null;
}

/**
 * Convert a Google Maps URL to an embeddable one, or `null` when it can't be
 * done with confidence (caller should show a link instead of an iframe).
 * - Already an embed URL (`/maps/embed` or `?output=embed`) → returned as-is.
 * - A `?q=...` or a `/maps/place/<name>/...` URL → rebuilt as
 *   `https://maps.google.com/maps?q=<query>&output=embed`.
 * - Anything else Google Maps (e.g. a bare `/maps/@lat,lng,zoom` with no name/
 *   query) → `null`, since guessing wrong reproduces the exact "refused to
 *   connect" bug this exists to fix.
 */
export function toGoogleMapsEmbedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!isGoogleMapsUrl(raw)) return null;

  if (url.pathname.includes('/maps/embed') || url.searchParams.get('output') === 'embed') {
    return raw;
  }

  const query = url.searchParams.get('q') ?? placeFromPath(url.pathname);
  if (query) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  }
  return null;
}
