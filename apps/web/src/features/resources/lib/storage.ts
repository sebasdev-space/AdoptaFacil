import type { ApiClient } from '../../../shell/api';

/**
 * Feature-local storage helper (M09) for delivery EVIDENCE photos. Evidences
 * are PUBLIC (stored openly by design, see `resource-delivery-evidences.service.ts`),
 * so only the upload transfers bytes (PUT /storage/upload; same two-step flow
 * as campaign evidences in `features/campaigns/lib/storage.ts` — duplicated
 * per-feature rather than shared, matching that file's UI-boundary note).
 */

/** Coherent with the backend STORAGE_MAX_FILE_MB default (T-108). */
export const MAX_UPLOAD_MB = 15;

/** Evidences accept photos of the delivered resource (or a PDF, e.g. a signed receipt). */
export const EVIDENCE_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

/** Validate an evidence file before uploading. Returns a plain-language error or `null`. */
export function validateEvidenceUpload(
  file: File,
  accept: readonly string[] = EVIDENCE_ACCEPT,
  maxMb: number = MAX_UPLOAD_MB,
): string | null {
  if (!accept.includes(file.type)) {
    return 'Tipo de archivo no permitido. Sube una imagen (JPG, PNG, WEBP, GIF) o un PDF.';
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `El archivo supera el límite de ${maxMb} MB.`;
  }
  return null;
}

/** PUT the evidence bytes to a reserved storage key (auth handled by the client). */
export async function uploadEvidenceFile(
  client: ApiClient,
  key: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);
  await client.request(`/storage/upload?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: form,
  });
}
