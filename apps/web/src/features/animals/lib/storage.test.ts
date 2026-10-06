import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../../shell/api';
import { DOCUMENT_ACCEPT, downloadPrivateFile, uploadFileBytes, validateUpload } from './storage';

describe('animals storage helpers (T-109a)', () => {
  describe('validateUpload (photos: images only)', () => {
    it('accepts an image', () => {
      expect(validateUpload({ type: 'image/png', size: 2048 } as File)).toBeNull();
    });
    it('rejects a non-image (e.g. PDF)', () => {
      expect(validateUpload({ type: 'application/pdf', size: 2048 } as File)).toMatch(
        /no permitido/i,
      );
    });
    it('rejects an image over the size limit', () => {
      expect(validateUpload({ type: 'image/jpeg', size: 20 * 1024 * 1024 } as File)).toMatch(
        /límite/i,
      );
    });
  });

  describe('validateUpload (clinical attachments: PDF or images, fix T-ANIMALS-ATTACHMENTS-AUDIT)', () => {
    it('accepts a PDF', () => {
      expect(
        validateUpload({ type: 'application/pdf', size: 2048 } as File, DOCUMENT_ACCEPT),
      ).toBeNull();
    });
    it('accepts an image', () => {
      expect(
        validateUpload({ type: 'image/jpeg', size: 2048 } as File, DOCUMENT_ACCEPT),
      ).toBeNull();
    });
    it('rejects an unrelated type with a PDF-or-image message', () => {
      expect(validateUpload({ type: 'text/plain', size: 2048 } as File, DOCUMENT_ACCEPT)).toMatch(
        /PDF.*imagen/i,
      );
    });
  });

  it('uploadFileBytes PUTs the photo to /storage/upload?key=…', async () => {
    const request = vi.fn().mockResolvedValue({ key: 'k', url: 'u' });
    const client = { request } as unknown as ApiClient;
    const file = new File([new Uint8Array([9, 9])], 'firu.png', { type: 'image/png' });

    await uploadFileBytes(client, 'public/org-1/uuid-firu.png', file);

    const [path, options] = request.mock.calls[0] as [string, { method: string; body: unknown }];
    expect(path).toBe(`/storage/upload?key=${encodeURIComponent('public/org-1/uuid-firu.png')}`);
    expect(options.method).toBe('PUT');
    expect(options.body).toBeInstanceOf(FormData);
  });

  describe('downloadPrivateFile (fix, T-ANIMALS-ATTACHMENTS-AUDIT)', () => {
    it('fetches the private endpoint with the Bearer token and triggers a save', async () => {
      const client = {
        config: { tokenStore: { getAccessToken: () => 'tok-123' } },
      } as unknown as ApiClient;
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['%PDF-1.4 mock']),
      });
      vi.stubGlobal('fetch', fetchMock);
      // jsdom's URL has no createObjectURL/revokeObjectURL at all (browser-only
      // API) — assign stubs directly rather than vi.spyOn, which requires the
      // property to already exist.
      const createObjectURL = vi.fn().mockReturnValue('blob:mock');
      const revokeObjectURL = vi.fn();
      const original = {
        createObjectURL: URL.createObjectURL,
        revokeObjectURL: URL.revokeObjectURL,
      };
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;

      try {
        await downloadPrivateFile(client, 'private/org-1/uuid-examen.pdf', 'examen.pdf');

        const [url, init] = fetchMock.mock.calls[0] as [
          string,
          { headers: Record<string, string> },
        ];
        expect(url).toContain(encodeURIComponent('private/org-1/uuid-examen.pdf'));
        expect(init.headers.Authorization).toBe('Bearer tok-123');
        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
      } finally {
        URL.createObjectURL = original.createObjectURL;
        URL.revokeObjectURL = original.revokeObjectURL;
        vi.unstubAllGlobals();
      }
    });

    it('throws a readable error on a failed download', async () => {
      const client = {
        config: { tokenStore: { getAccessToken: () => null } },
      } as unknown as ApiClient;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

      await expect(downloadPrivateFile(client, 'private/org-1/x.pdf', 'x.pdf')).rejects.toThrow(
        /no se pudo descargar/i,
      );
      vi.unstubAllGlobals();
    });
  });
});
