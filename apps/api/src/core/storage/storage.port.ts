/**
 * StoragePort (hexagonal) — the SINGLE shared definition for file assets (logos,
 * photos, clinical attachments, legal documents, …). Promoted to core in T-107;
 * T-108 adds a REAL disk adapter behind the SAME interface (byte persistence +
 * retrieval), selectable by env — swapping to S3/GCS later is one `useClass`/
 * factory line in StorageModule, with NO change to the consuming modules.
 *
 * Consumers depend ONLY on this abstraction and on the opaque `key` (persisted as
 * their `storageRef`). Nothing disk/S3-specific (physical paths, roots, naming)
 * ever leaks here.
 */
export const STORAGE_PORT = Symbol('STORAGE_PORT');

/** Whether a stored object is served openly or behind JWT+RBAC (T-108). */
export type StorageVisibility = 'public' | 'private';

export interface StoredObject {
  /** URL the client PUTs the bytes to (the upload target). */
  url: string;
  /** Opaque storage key/path (persisted as the caller's storageRef). */
  key: string;
}

export interface CreateUploadInput {
  organizationId: string;
  filename: string;
  contentType?: string;
  /**
   * T-108 (additive, default `private`): `public` objects (org logos, animal
   * photos) are served openly; `private` objects (legal documents, clinical
   * attachments) are served only behind JWT+RBAC+tenant. Defaulting to `private`
   * keeps every existing caller safe; the public callers opt in explicitly.
   */
  visibility?: StorageVisibility;
}

/** Bytes + content type read back from storage. */
export interface StoredObjectData {
  data: Buffer;
  contentType?: string;
}

export interface StoragePort {
  /**
   * Reserve the storage target (unguessable key + upload URL) for an org asset.
   * Does NOT transfer bytes — the client PUTs them to the returned `url`.
   */
  createUploadTarget(input: CreateUploadInput): Promise<StoredObject>;

  /** Resolve the display/serve URL for a persisted key (public or private). */
  resolvePublicUrl(key: string): string;

  /**
   * T-108 (additive): persist real bytes for a reserved key. Adapters enforce
   * path safety and the size limit. The stub keeps bytes in memory.
   */
  saveObject(key: string, data: Buffer, contentType?: string): Promise<void>;

  /** T-108 (additive): read the bytes for a key, or null when it does not exist. */
  readObject(key: string): Promise<StoredObjectData | null>;
}
