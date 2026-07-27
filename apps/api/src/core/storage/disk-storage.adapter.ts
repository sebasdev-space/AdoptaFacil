import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import type {
  CreateUploadInput,
  StoragePort,
  StoredObject,
  StoredObjectData,
} from './storage.port';
import { assertSafeRelativeKey, buildStorageKey, contentTypeFromKey } from './storage-keys';

/**
 * Real filesystem StoragePort for the VPS (T-108). Persists bytes under
 * `<STORAGE_DISK_ROOT>/<visibility>/<orgId>/<uuid>-<file>`, OUTSIDE any webroot,
 * and serves them back only through the API's storage endpoints (access control
 * there). Everything filesystem-specific (root, layout, path safety, size limit)
 * is confined to THIS class — a future S3Adapter implements the same StoragePort
 * and is swapped in StorageModule with no change to org/animals.
 *
 * Compression/resize of images remains a TODO (out of scope): we persist bytes as
 * received.
 */
@Injectable()
export class DiskStorageAdapter implements StoragePort {
  private readonly root: string;
  private readonly maxBytes: number;
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('STORAGE_DISK_ROOT', { infer: true }));
    this.maxBytes = config.get('STORAGE_MAX_FILE_MB', { infer: true }) * 1024 * 1024;
    // Trim a trailing slash so URL building is predictable.
    this.publicBaseUrl = config.get('STORAGE_PUBLIC_BASE_URL', { infer: true }).replace(/\/+$/, '');
  }

  async createUploadTarget(input: CreateUploadInput): Promise<StoredObject> {
    const key = buildStorageKey(
      input.visibility ?? 'private',
      input.organizationId,
      input.filename,
    );
    // The client PUTs the bytes to this API endpoint (JWT + org-scoped).
    return { key, url: `${this.publicBaseUrl}/storage/upload?key=${encodeURIComponent(key)}` };
  }

  resolvePublicUrl(key: string): string {
    const route = key.startsWith('public/') ? 'public' : 'private';
    return `${this.publicBaseUrl}/storage/${route}?key=${encodeURIComponent(key)}`;
  }

  async saveObject(key: string, data: Buffer, contentType?: string): Promise<void> {
    if (data.length > this.maxBytes) {
      throw new Error(`File exceeds the maximum size of ${this.maxBytes} bytes`);
    }
    void contentType; // content type is inferred from the key extension on read
    const full = this.resolvePath(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async readObject(key: string): Promise<StoredObjectData | null> {
    const full = this.resolvePath(key);
    try {
      const data = await readFile(full);
      return { data, contentType: contentTypeFromKey(key) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /** Resolve a key to an absolute path, refusing anything outside the root. */
  private resolvePath(key: string): string {
    assertSafeRelativeKey(key);
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error('Path traversal detected');
    }
    return full;
  }
}
