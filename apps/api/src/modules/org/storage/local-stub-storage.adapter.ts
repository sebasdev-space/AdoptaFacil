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
 * Simulable storage adapter (Ola 1): returns a deterministic-looking stub URL
 * under a non-routable host, scoped by organization. No real provider, no bytes
 * transferred — it only demonstrates the ports/adapters seam so M01 can store
 * logo/photo URLs today and swap in a real backend later.
 */
@Injectable()
export class LocalStubStorageAdapter implements StoragePort {
  private readonly baseUrl = process.env.STORAGE_STUB_BASE_URL ?? 'https://storage.stub.local';

  async createUploadTarget(input: CreateUploadInput): Promise<StoredObject> {
    const key = `orgs/${input.organizationId}/${randomUUID()}-${safeName(input.filename)}`;
    return { key, url: `${this.baseUrl}/${key}` };
  }
}
