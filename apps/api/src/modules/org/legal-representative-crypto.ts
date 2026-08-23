import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Encryption-at-rest for the legal representative's signature file (S-1, RNF10).
 * AES-256-GCM: authenticated encryption, so any tampering with the stored bytes
 * is detected on decrypt (never silently returns corrupted/forged plaintext).
 * Kept in `modules/org` (not `core/`) — this is the ONLY consumer, per this
 * task's file scope; promote to a shared crypto port only if a second module
 * ever needs the same pattern.
 */

const IV_LENGTH = 12; // recommended nonce size for AES-GCM
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // AES-256

export const LEGAL_REPRESENTATIVE_CONFIG = Symbol('LEGAL_REPRESENTATIVE_CONFIG');

export interface LegalRepresentativeConfig {
  /** 32-byte AES-256 key. Never logged, never returned by any endpoint. */
  signatureEncryptionKey: Buffer;
}

// Fixed, obviously-fake 32-byte key so local dev/CI boot without extra setup —
// same convention as auth.config.ts's DEV_SECRET for JWT_SECRET.
const DEV_KEY_HEX = '11'.repeat(KEY_LENGTH);

/**
 * Reads `LEGAL_REP_SIGNATURE_KEY` directly from `process.env` (NOT through the
 * central Zod `envSchema`) — same convention as `auth.config.ts`'s
 * `loadAuthConfig()` for `JWT_SECRET`: a dedicated loader function, dev
 * fallback, hard-fail in production if unset.
 */
export function loadLegalRepresentativeConfig(): LegalRepresentativeConfig {
  const isProd = process.env.NODE_ENV === 'production';
  const hex = process.env.LEGAL_REP_SIGNATURE_KEY ?? (isProd ? '' : DEV_KEY_HEX);
  if (!hex) {
    throw new Error(
      'LEGAL_REP_SIGNATURE_KEY must be set in production to encrypt legal representative signatures.',
    );
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `LEGAL_REP_SIGNATURE_KEY must be a ${KEY_LENGTH * 2}-character hex string (${KEY_LENGTH} bytes) for AES-256-GCM.`,
    );
  }
  return { signatureEncryptionKey: key };
}

/** SHA-256 (hex) of the ORIGINAL, pre-encryption signature bytes — reusable for
 *  the certificate hash+QR (Consolidación §8); never derived from ciphertext. */
export function hashSignature(plaintext: Buffer): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** Encrypts `plaintext` and packs `iv || authTag || ciphertext` into one buffer
 *  — everything `decryptSignature` needs is self-contained in the stored bytes,
 *  so no side-channel metadata has to be kept in sync with the encrypted file. */
export function encryptSignature(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/** Inverse of {@link encryptSignature}. Throws if the key is wrong or the bytes
 *  were tampered with (GCM auth-tag verification) — never returns bad plaintext. */
export function decryptSignature(payload: Buffer, key: Buffer): Buffer {
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
