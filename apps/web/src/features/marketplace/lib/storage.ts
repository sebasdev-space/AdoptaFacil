import type { ApiClient } from '../../../shell/api';

/**
 * Feature-local storage helper (M10) for product photos. Product photos are
 * PUBLIC (shown in the marketplace catalog), so only the upload transfers
 * bytes (PUT /storage/upload; same two-step flow as campaign evidences in
 * `features/campaigns/lib/storage.ts` — duplicated per-feature rather than
 * shared, matching that file's UI-boundary note).
 */

/** Coherent with the backend STORAGE_MAX_FILE_MB default (T-108). */
export const MAX_UPLOAD_MB = 15;

export const IMAGE_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Validate a product photo before uploading. Returns a plain-language error or `null`. */
export function validateImageUpload(
  file: File,
  accept: readonly string[] = IMAGE_ACCEPT,
  maxMb: number = MAX_UPLOAD_MB,
): string | null {
  if (!accept.includes(file.type)) {
    return 'Tipo de archivo no permitido. Sube una imagen (JPG, PNG, WEBP o GIF).';
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `El archivo supera el límite de ${maxMb} MB.`;
  }
  return null;
}

/** PUT the image bytes to a reserved storage key (auth handled by the client). */
export async function uploadImageFile(client: ApiClient, key: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);
  await client.request(`/storage/upload?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: form,
  });
}
