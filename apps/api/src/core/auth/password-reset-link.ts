/**
 * Builds the clickable password-reset link emailed to the user (T-110/RF05).
 * Pure and framework-free so it is trivial to unit-test. The token is placed in
 * the query string; it is URL-encoded defensively (base64url is already URL-safe,
 * but encoding keeps the builder correct for any token scheme).
 */
export function buildPasswordResetLink(webBaseUrl: string, token: string): string {
  const base = webBaseUrl.replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}
