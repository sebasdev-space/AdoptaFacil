/**
 * StoragePort (hexagonal) for animal photos — Ola 1 ships only the PORT and a
 * simulable stub adapter (no real object-storage provider, no image processing).
 *
 * TODO(refactor): this is a LOCAL copy of the same port defined in
 * apps/api/src/modules/org/storage/storage.port.ts. Module-boundary rules
 * prevent importing across feature modules, so it is duplicated here for now.
 * Unify into a shared home (core/** or a @adoptafacil/contracts port) in a
 * cross-cutting task and have both org and animals consume the single source.
 */
export const ANIMAL_STORAGE_PORT = Symbol('ANIMAL_STORAGE_PORT');

export interface StoredObject {
  /** Public URL for display/serving. */
  url: string;
  /** Opaque storage key/path (persisted as the photo's storageRef). */
  key: string;
}

export interface CreateUploadInput {
  organizationId: string;
  filename: string;
  contentType?: string;
}

export interface StoragePort {
  /**
   * Produce the storage target (key + public URL) for an animal photo. In Ola 1
   * the stub returns a simulated URL without transferring bytes; later adapters
   * would return a presigned URL / perform the real upload + compression.
   */
  createUploadTarget(input: CreateUploadInput): Promise<StoredObject>;

  /** Resolve the public URL for a persisted storage key (metadata → display). */
  resolvePublicUrl(key: string): string;
}
