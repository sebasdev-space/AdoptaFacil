/**
 * Builds the clickable "magic link" emailed to a GUEST donor so they can check
 * their donation's status/receipt/certificate without an account (client
 * requirement: donating — and checking on a donation — must never require a
 * login). Mirrors `buildPasswordResetLink` (core/auth/password-reset-link.ts):
 * pure and framework-free so it is trivial to unit-test. The token is placed
 * in the query string; it is URL-encoded defensively (base64url is already
 * URL-safe, but encoding keeps the builder correct for any token scheme).
 */
export function buildDonationAccessLink(webBaseUrl: string, token: string): string {
  const base = webBaseUrl.replace(/\/+$/, '');
  return `${base}/donaciones/comprobante?token=${encodeURIComponent(token)}`;
}
