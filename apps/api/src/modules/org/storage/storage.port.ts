/**
 * StoragePort (hexagonal) for logos/photos. Ola 1 ships only the PORT and a
 * simulable stub adapter — no real object-storage provider is wired. Real
 * adapters (S3/GCS/…) arrive later behind this same interface.
 */
export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface StoredObject {
  /** Public URL the profile stores/serves. */
  url: string;
  /** Opaque storage key/path. */
  key: string;
}

export interface CreateUploadInput {
  organizationId: string;
  filename: string;
  contentType?: string;
}

export interface StoragePort {
  /**
   * Produce the storage target (key + public URL) for an org asset. In Ola 1
   * the stub returns a simulated URL without transferring bytes; later adapters
   * would return a presigned URL / perform the real upload.
   */
  createUploadTarget(input: CreateUploadInput): Promise<StoredObject>;
}
