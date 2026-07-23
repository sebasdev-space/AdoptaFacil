import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CreateUploadInput, StoragePort, StoredObject } from './storage.port';

/** Sanitize a filename to a safe key segment. */
function safeName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'file';
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'file'
  );
}

/**
 * Simulable storage adapter (local-dev): returns a deterministic-looking stub URL
 * under a non-routable host, scoped by organization. No real provider, no bytes
 * transferred — it demonstrates the ports/adapters seam. The single stub for the
 * whole API (T-107); a real adapter replaces it behind STORAGE_PORT.
 */
@Injectable()
export class LocalStubStorageAdapter implements StoragePort {
  private readonly baseUrl = process.env.STORAGE_STUB_BASE_URL ?? 'https://storage.stub.local';

  async createUploadTarget(input: CreateUploadInput): Promise<StoredObject> {
    const key = `orgs/${input.organizationId}/${randomUUID()}-${safeName(input.filename)}`;
    return { key, url: this.resolvePublicUrl(key) };
  }

  resolvePublicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}
