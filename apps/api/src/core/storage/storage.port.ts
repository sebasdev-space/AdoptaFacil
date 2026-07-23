/**
 * StoragePort (hexagonal) — the SINGLE shared definition for file assets (logos,
 * photos, clinical attachments, …). Promoted to core in T-107, unifying the
 * per-module copies that org (T-101) and animals (T-104/T-105) used to carry.
 *
 * Ola 1 ships only the PORT and a simulable stub (see LocalStubStorageAdapter);
 * a real object-storage adapter (S3/GCS/…) can be bound to STORAGE_PORT in
 * production WITHOUT touching the consuming modules — they depend on this
 * abstraction, never on the concrete stub. Future modules (payments evidence,
 * community media, …) MUST consume this port, not add their own.
 */
export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface StoredObject {
  /** Public URL for display/serving. */
  url: string;
  /** Opaque storage key/path (persisted as the caller's storageRef). */
  key: string;
}

export interface CreateUploadInput {
  organizationId: string;
  filename: string;
  contentType?: string;
}

export interface StoragePort {
  /**
   * Produce the storage target (key + public URL) for an org asset. In Ola 1 the
   * stub returns a simulated URL without transferring bytes; a real adapter would
   * return a presigned URL / perform the upload (and any compression).
   */
  createUploadTarget(input: CreateUploadInput): Promise<StoredObject>;

  /** Resolve the public URL for a persisted storage key (metadata → display). */
  resolvePublicUrl(key: string): string;
}
