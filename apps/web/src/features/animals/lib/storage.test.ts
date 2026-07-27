import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../../../shell/api';
import { uploadFileBytes, validateUpload } from './storage';

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
});
