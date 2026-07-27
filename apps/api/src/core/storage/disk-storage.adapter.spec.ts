import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { DiskStorageAdapter } from './disk-storage.adapter';

const ORG = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';

function makeAdapter(root: string, maxMb = 1): DiskStorageAdapter {
  const values: Record<string, unknown> = {
    STORAGE_DISK_ROOT: root,
    STORAGE_MAX_FILE_MB: maxMb,
    STORAGE_PUBLIC_BASE_URL: 'http://localhost:3000',
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  return new DiskStorageAdapter(config);
}

describe('DiskStorageAdapter (T-108)', () => {
  let root: string;
  let adapter: DiskStorageAdapter;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'adoptafacil-storage-'));
    adapter = makeAdapter(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('createUploadTarget returns a scoped key + an upload URL', async () => {
    const { key, url } = await adapter.createUploadTarget({
      organizationId: ORG,
      filename: 'demanda.pdf',
      visibility: 'private',
    });
    expect(key.startsWith(`private/${ORG}/`)).toBe(true);
    expect(url).toContain('/storage/upload?key=');
    expect(url).toContain(encodeURIComponent(key));
  });

  it('persists and reads back identical bytes', async () => {
    const { key } = await adapter.createUploadTarget({
      organizationId: ORG,
      filename: 'photo.png',
      visibility: 'public',
    });
    const bytes = Buffer.from('hello-bytes-123');
    await adapter.saveObject(key, bytes, 'image/png');
    const read = await adapter.readObject(key);
    expect(read?.data.equals(bytes)).toBe(true);
    expect(read?.contentType).toBe('image/png');
  });

  it('returns null for a missing object', async () => {
    expect(await adapter.readObject(`public/${ORG}/missing-x.png`)).toBeNull();
  });

  it('rejects a file over the configured size limit', async () => {
    const { key } = await adapter.createUploadTarget({ organizationId: ORG, filename: 'big.pdf' });
    const tooBig = Buffer.alloc(1024 * 1024 + 1); // > 1 MB
    await expect(adapter.saveObject(key, tooBig)).rejects.toThrow(/max/i);
  });

  it('refuses path traversal on read and save', async () => {
    await expect(adapter.readObject('../../etc/passwd')).rejects.toThrow();
    await expect(adapter.saveObject('a/../../b', Buffer.from('x'))).rejects.toThrow();
  });

  it('resolvePublicUrl routes public vs private', () => {
    expect(adapter.resolvePublicUrl(`public/${ORG}/a-x.jpg`)).toContain('/storage/public?key=');
    expect(adapter.resolvePublicUrl(`private/${ORG}/a-x.pdf`)).toContain('/storage/private?key=');
  });
});
