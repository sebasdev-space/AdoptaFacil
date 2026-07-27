import {
  assertSafeRelativeKey,
  buildStorageKey,
  contentTypeFromKey,
  parseStorageKey,
  safeName,
} from './storage-keys';

const ORG = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';

describe('storage-keys (T-108)', () => {
  describe('safeName', () => {
    it('strips directories, lowercases and replaces unsafe chars', () => {
      expect(safeName('C:\\path\\Mi Foto (1).JPG')).toBe('mi-foto-1-.jpg');
      expect(safeName('../../etc/passwd')).toBe('passwd');
      expect(safeName('')).toBe('file');
    });
  });

  describe('buildStorageKey', () => {
    it('produces <visibility>/<org>/<uuid>-<name> and is unguessable per call', () => {
      const a = buildStorageKey('private', ORG, 'doc.pdf');
      const b = buildStorageKey('private', ORG, 'doc.pdf');
      expect(a.startsWith(`private/${ORG}/`)).toBe(true);
      expect(a.endsWith('-doc.pdf')).toBe(true);
      expect(a).not.toBe(b); // uuid differs
    });
  });

  describe('assertSafeRelativeKey', () => {
    it('rejects traversal / absolute / drive / backslash / NUL', () => {
      for (const bad of ['../x', 'a/../b', '/abs/x', 'C:/x', 'a\\b', 'a\0b', '']) {
        expect(() => assertSafeRelativeKey(bad)).toThrow();
      }
      expect(() => assertSafeRelativeKey(`public/${ORG}/uuid-x.jpg`)).not.toThrow();
    });
  });

  describe('parseStorageKey', () => {
    it('parses a valid key', () => {
      expect(parseStorageKey(`public/${ORG}/abc-firu.jpg`)).toEqual({
        visibility: 'public',
        organizationId: ORG,
      });
    });
    it('returns null for bad visibility, bad org, traversal or too few segments', () => {
      expect(parseStorageKey(`secret/${ORG}/x.jpg`)).toBeNull();
      expect(parseStorageKey('public/not-a-uuid/x.jpg')).toBeNull();
      expect(parseStorageKey(`public/${ORG}`)).toBeNull();
      expect(parseStorageKey(`public/${ORG}/`)).toBeNull();
      expect(parseStorageKey(`../public/${ORG}/x`)).toBeNull();
    });
  });

  describe('contentTypeFromKey', () => {
    it('maps known extensions and falls back to octet-stream', () => {
      expect(contentTypeFromKey('a/b/c-x.jpg')).toBe('image/jpeg');
      expect(contentTypeFromKey('a/b/c-x.pdf')).toBe('application/pdf');
      expect(contentTypeFromKey('a/b/c-x.bin')).toBe('application/octet-stream');
    });
  });
});
