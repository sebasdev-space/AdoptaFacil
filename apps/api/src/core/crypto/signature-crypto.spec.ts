import {
  decryptSignature,
  encryptSignature,
  hashSignature,
  loadSignatureEncryptionConfig,
} from './signature-crypto';

const KEY = Buffer.from('11'.repeat(32), 'hex');

describe('signature-crypto', () => {
  describe('encryptSignature / decryptSignature (AES-256-GCM round trip)', () => {
    it('decrypts back to the exact original plaintext', () => {
      const plaintext = Buffer.from('a fake signature PNG payload, not real bytes');
      const encrypted = encryptSignature(plaintext, KEY);
      expect(decryptSignature(encrypted, KEY)).toEqual(plaintext);
    });

    it('never stores the plaintext bytes verbatim inside the encrypted payload', () => {
      const plaintext = Buffer.from('super-secret-signature-marker');
      const encrypted = encryptSignature(plaintext, KEY);
      expect(encrypted.includes(plaintext)).toBe(false);
    });

    it('produces a different ciphertext every time (random IV) even for the same input', () => {
      const plaintext = Buffer.from('same input twice');
      const a = encryptSignature(plaintext, KEY);
      const b = encryptSignature(plaintext, KEY);
      expect(a.equals(b)).toBe(false);
      expect(decryptSignature(a, KEY)).toEqual(plaintext);
      expect(decryptSignature(b, KEY)).toEqual(plaintext);
    });

    it('rejects decryption with the wrong key', () => {
      const plaintext = Buffer.from('signature bytes');
      const encrypted = encryptSignature(plaintext, KEY);
      const wrongKey = Buffer.from('22'.repeat(32), 'hex');
      expect(() => decryptSignature(encrypted, wrongKey)).toThrow();
    });

    it('detects tampering with the stored bytes (GCM auth tag) instead of returning corrupted plaintext', () => {
      const plaintext = Buffer.from('signature bytes to protect');
      const encrypted = encryptSignature(plaintext, KEY);
      const tampered = Buffer.from(encrypted);
      tampered[tampered.length - 1] ^= 0xff; // flip the last ciphertext byte
      expect(() => decryptSignature(tampered, KEY)).toThrow();
    });
  });

  describe('hashSignature', () => {
    it('is deterministic for the same bytes', () => {
      const bytes = Buffer.from('identical content');
      expect(hashSignature(bytes)).toBe(hashSignature(Buffer.from('identical content')));
    });

    it('differs for different bytes', () => {
      expect(hashSignature(Buffer.from('a'))).not.toBe(hashSignature(Buffer.from('b')));
    });

    it('is a 64-char lowercase hex string (SHA-256)', () => {
      expect(hashSignature(Buffer.from('x'))).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('loadSignatureEncryptionConfig', () => {
    const originalNew = process.env.SIGNATURE_ENCRYPTION_KEY;
    const originalOld = process.env.LEGAL_REP_SIGNATURE_KEY;
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.SIGNATURE_ENCRYPTION_KEY = originalNew;
      process.env.LEGAL_REP_SIGNATURE_KEY = originalOld;
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('falls back to a fixed dev key outside production', () => {
      delete process.env.SIGNATURE_ENCRYPTION_KEY;
      delete process.env.LEGAL_REP_SIGNATURE_KEY;
      process.env.NODE_ENV = 'test';
      const config = loadSignatureEncryptionConfig();
      expect(config.signatureEncryptionKey).toHaveLength(32);
    });

    it('falls back to the older LEGAL_REP_SIGNATURE_KEY name for back-compat', () => {
      delete process.env.SIGNATURE_ENCRYPTION_KEY;
      process.env.LEGAL_REP_SIGNATURE_KEY = '33'.repeat(32);
      process.env.NODE_ENV = 'test';
      const config = loadSignatureEncryptionConfig();
      expect(config.signatureEncryptionKey).toEqual(Buffer.from('33'.repeat(32), 'hex'));
    });

    it('throws in production when no key is set', () => {
      delete process.env.SIGNATURE_ENCRYPTION_KEY;
      delete process.env.LEGAL_REP_SIGNATURE_KEY;
      process.env.NODE_ENV = 'production';
      expect(() => loadSignatureEncryptionConfig()).toThrow(/must be set in production/);
    });

    it('throws when the configured key is not exactly 32 bytes', () => {
      process.env.SIGNATURE_ENCRYPTION_KEY = 'ab'; // 1 byte, not 32
      process.env.NODE_ENV = 'test';
      expect(() => loadSignatureEncryptionConfig()).toThrow(/32 bytes/);
    });
  });
});
