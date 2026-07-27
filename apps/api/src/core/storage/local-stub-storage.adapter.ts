import { Injectable } from '@nestjs/common';
import type {
  CreateUploadInput,
  StoragePort,
  StoredObject,
  StoredObjectData,
} from './storage.port';
import { buildStorageKey, contentTypeFromKey } from './storage-keys';

/**
 * Simulable storage adapter (local-dev / tests). No real filesystem: bytes live
 * in an in-memory map so `saveObject`/`readObject` round-trip within a process,
 * and `createUploadTarget` reserves a key without transferring anything. Selected
 * when STORAGE_DRIVER=stub (the default in tests). Real persistence is
 * DiskStorageAdapter (T-108).
 */
@Injectable()
export class LocalStubStorageAdapter implements StoragePort {
  private readonly baseUrl = process.env.STORAGE_STUB_BASE_URL ?? 'https://storage.stub.local';
  private readonly objects = new Map<string, StoredObjectData>();

  async createUploadTarget(input: CreateUploadInput): Promise<StoredObject> {
    const key = buildStorageKey(
      input.visibility ?? 'private',
      input.organizationId,
      input.filename,
    );
    return { key, url: this.resolvePublicUrl(key) };
  }

  resolvePublicUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  async saveObject(key: string, data: Buffer, contentType?: string): Promise<void> {
    this.objects.set(key, { data, contentType: contentType ?? contentTypeFromKey(key) });
  }

  async readObject(key: string): Promise<StoredObjectData | null> {
    return this.objects.get(key) ?? null;
  }
}
