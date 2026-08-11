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

/** `/maps/@4.6,-74.1,15z` → "4.6,-74.1" (exact coordinates, not a guess). */
function coordsFromPath(pathname: string): string | null {
  const match = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(pathname);
  return match ? `${match[1]},${match[2]}` : null;
}

/**
 * Convert a Google Maps URL to an embeddable one, or `null` when it can't be
 * done with confidence (caller should show a link instead of an iframe).
 * - Already an embed URL (`/maps/embed` or `?output=embed`) → returned as-is.
 * - A `?q=...` or a `/maps/place/<name>/...` URL → rebuilt as
 *   `https://maps.google.com/maps?q=<query>&output=embed`.
 * - A bare `/maps/@lat,lng,zoom` (no name/query) → rebuilt from the EXACT
 *   coordinates already in the URL (`?q=lat,lng&output=embed`) — this is not
 *   a guess, the location is fully specified by those two numbers.
 * - Anything else (e.g. a `maps.app.goo.gl`/`goo.gl` SHORT link from a phone's
 *   share sheet) → `null`. A short link carries no place/coordinate info in
 *   the URL itself — resolving it requires following its redirect, which (a)
 *   needs a network round trip this pure string transform intentionally
 *   avoids, and (b) would just land on Google's normal map page, which
 *   blocks framing anyway (the exact "refused to connect" bug this exists to
 *   fix). Falling back to "Ver en mapa →" here is the correct, honest
 *   behavior, not a bug — documented so it isn't mistaken for one twice.
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

  const query =
    url.searchParams.get('q') ?? placeFromPath(url.pathname) ?? coordsFromPath(url.pathname);
  if (query) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  }
  return null;
}
