import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../../shell/api';
import { DOCUMENT_ACCEPT, uploadFileBytes, validateUpload } from './storage';

describe('org storage helpers (T-109a)', () => {
  describe('validateUpload', () => {
    it('accepts a valid PDF', () => {
      expect(
        validateUpload({ type: 'application/pdf', size: 1024 } as File, DOCUMENT_ACCEPT),
      ).toBeNull();
    });
    it('rejects a disallowed type', () => {
      expect(validateUpload({ type: 'text/plain', size: 10 } as File, DOCUMENT_ACCEPT)).toMatch(
        /no permitido/i,
      );
    });
    it('rejects a file over the size limit', () => {
      expect(
        validateUpload(
          { type: 'application/pdf', size: 20 * 1024 * 1024 } as File,
          DOCUMENT_ACCEPT,
        ),
      ).toMatch(/límite/i);
    });
  });

  describe('uploadFileBytes', () => {
    it('PUTs a multipart body to /storage/upload?key=…', async () => {
      const request = vi.fn().mockResolvedValue({ key: 'k', url: 'u' });
      const client = { request } as unknown as ApiClient;
      const file = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' });

      await uploadFileBytes(client, 'private/org-1/uuid-doc.pdf', file);

      expect(request).toHaveBeenCalledTimes(1);
      const [path, options] = request.mock.calls[0] as [string, { method: string; body: unknown }];
      expect(path).toBe(`/storage/upload?key=${encodeURIComponent('private/org-1/uuid-doc.pdf')}`);
      expect(options.method).toBe('PUT');
      expect(options.body).toBeInstanceOf(FormData);
    });
  });
});
