// Module: M02 auth · Contracts owner: @sebastian
//
// IdentityPort (contract-first). Publishes ONLY the contract a third-party
// identity verifier exposes (Google Sign-In, T-0xx) so `POST /auth/google`
// can be built against a stable, simulable surface WITHOUT real Google OAuth
// credentials (the client has not provided GOOGLE_OAUTH_CLIENT_ID yet). Mirrors
// the PaymentPort pattern in payments.ts: a PORT interface + a deterministic
// FAKE adapter live here; the DI token, @Global module and the REAL
// GoogleIdentityAdapter (google-auth-library) live in
// apps/api/src/core/identity/ and are Sebastián's implementation task.
//
// CLOSED decisions reflected here (do NOT reopen):
//   - Google Sign-In applies to EITHER account type, but only to LOG IN to an
//     existing account or to CREATE a lightweight new Person account. It NEVER
//     creates an Organization — that stays the long NIT/legal-representative
//     form. Auto-link is by `AuthCredential.email` (case-insensitive), whether
//     that credential was originally created with a password or with Google.

/** Normalized identity claims returned after verifying a third-party token. */
export interface IdentityClaims {
  /** Verified email address (already normalized: trimmed + lowercased). */
  email: string;
  /** Display name as reported by the provider. */
  name: string;
  /** Whether the provider itself asserts the email is verified. */
  emailVerified: boolean;
  /** Provider-stable subject id (Google's `sub` claim). */
  sub: string;
}

/**
 * The identity-verification port (hexagonal). Ola 1 binds a simulable FAKE
 * adapter (`AUTH_IDENTITY_DRIVER=fake`, default); the real Google adapter binds
 * behind this SAME interface once `AUTH_IDENTITY_DRIVER=google` and
 * `GOOGLE_OAUTH_CLIENT_ID` are set (blocked on the client handing over real
 * Google OAuth credentials — same "stub until credentials exist" shape as
 * PaymentPort/MercadoPago before T-052).
 */
export interface IdentityPort {
  /**
   * Verify a Google ID token (JWT from Google Identity Services) and return its
   * normalized claims. Rejects for an invalid, expired, malformed, or
   * (for the real adapter) wrong-audience token — the caller never receives a
   * half-populated claim set.
   */
  verifyGoogleIdToken(idToken: string): Promise<IdentityClaims>;
}

/** Dependency-free deterministic string hash (djb2) → positive hex; no node/crypto,
 *  browser-safe (mirrors the private helper in payments.ts). */
function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Alternate fake-token payload: a base64url-encoded JSON object, for callers
 *  (e.g. e2e tests) that need to control `sub`/`emailVerified` explicitly. */
interface FakeTokenPayload {
  email: string;
  name: string;
  sub?: string;
  emailVerified?: boolean;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Manual base64 → byte decoder — no `Buffer`/`atob`/`TextDecoder` (this repo's
 *  `lib` is `ES2022` only, no DOM), so this stays dependency-free and portable
 *  like the rest of this file (mirrors FakePaymentAdapter's convention). */
function base64ToBytes(base64: string): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of base64) {
    const value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) continue; // skip padding ('=') and any stray character
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

/** Decode UTF-8 bytes to a string (handles the full range Google names use). */
function utf8BytesToString(bytes: number[]): string {
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const byte1 = bytes[i++];
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1);
    } else if ((byte1 & 0xe0) === 0xc0 && i < bytes.length) {
      const byte2 = bytes[i++];
      result += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f));
    } else if ((byte1 & 0xf0) === 0xe0 && i + 1 < bytes.length) {
      const byte2 = bytes[i++];
      const byte3 = bytes[i++];
      result += String.fromCharCode(
        ((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f),
      );
    } else if ((byte1 & 0xf8) === 0xf0 && i + 2 < bytes.length) {
      const byte2 = bytes[i++];
      const byte3 = bytes[i++];
      const byte4 = bytes[i++];
      const codePoint =
        ((byte1 & 0x07) << 18) | ((byte2 & 0x3f) << 12) | ((byte3 & 0x3f) << 6) | (byte4 & 0x3f);
      result += String.fromCodePoint(codePoint);
    }
    // else: skip an invalid/truncated leading byte rather than throw — this is
    // a dev/test double, never a security boundary.
  }
  return result;
}

/** Decode a base64url string to a UTF-8 string (no `Buffer`/`atob` — see above). */
function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  return utf8BytesToString(base64ToBytes(base64));
}

function isFakeTokenPayload(value: unknown): value is FakeTokenPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FakeTokenPayload).email === 'string' &&
    typeof (value as FakeTokenPayload).name === 'string'
  );
}

/**
 * Deterministic {@link IdentityPort} for development and tests: no network, no
 * real Google account required. Documented token formats (`AUTH_IDENTITY_DRIVER=fake`,
 * the default):
 *
 *   1. `fake:<email>:<name>` — the PRIMARY, simplest format, e.g.
 *      `fake:jane@example.com:Jane Doe`. Yields `emailVerified: true` and a
 *      `sub` derived deterministically from the email (same email → same sub,
 *      every run — no state needed, mirrors FakePaymentAdapter's id derivation).
 *   2. A base64url-encoded JSON object `{ email, name, sub?, emailVerified? }` —
 *      an ALTERNATE format for callers that need to control `sub`/`emailVerified`
 *      explicitly (e.g. exercising "same sub, different email" edge cases).
 *
 * Any other input is rejected (mirrors a real verifier rejecting a malformed
 * token) — this is a test double, not a bypass of the "must present something
 * shaped like a token" contract.
 */
export class FakeIdentityAdapter implements IdentityPort {
  static readonly PROVIDER = 'fake-local';

  async verifyGoogleIdToken(idToken: string): Promise<IdentityClaims> {
    if (idToken.startsWith('fake:')) {
      const rest = idToken.slice('fake:'.length);
      const separatorIndex = rest.indexOf(':');
      if (separatorIndex === -1) {
        throw new Error('Invalid fake identity token: expected "fake:<email>:<name>"');
      }
      const email = rest.slice(0, separatorIndex).trim().toLowerCase();
      const name = rest.slice(separatorIndex + 1).trim();
      if (!email || !name) {
        throw new Error('Invalid fake identity token: email and name are required');
      }
      return { email, name, emailVerified: true, sub: `fake-${stableHash(email)}` };
    }

    try {
      const decoded = decodeBase64Url(idToken);
      const parsed: unknown = JSON.parse(decoded);
      if (!isFakeTokenPayload(parsed)) {
        throw new Error('missing email/name');
      }
      const email = parsed.email.trim().toLowerCase();
      return {
        email,
        name: parsed.name,
        emailVerified: parsed.emailVerified ?? true,
        sub: parsed.sub ?? `fake-${stableHash(email)}`,
      };
    } catch {
      throw new Error(
        'Invalid fake identity token: expected "fake:<email>:<name>" or a base64url JSON payload',
      );
    }
  }
}
