import type { ApiClient } from '../../../shell/api';

/**
 * Feature-local storage helper (M11) for post photos. Post photos are PUBLIC
 * (shown in the shared feed), so only the upload transfers bytes (PUT
 * /storage/upload; same two-step flow as marketplace/campaigns —
 * duplicated per-feature rather than shared). Deliberately narrower than
 * other features: the formulario de publicación (RF de M11) restricts
 * images to JPEG/PNG up to 5MB, matching the backend's `PostImageInput`.
 */

export const MAX_UPLOAD_MB = 5;

export const IMAGE_ACCEPT = ['image/jpeg', 'image/png'] as const;

/** Validate a post photo before uploading. Returns a plain-language error or `null`. */
export function validateImageUpload(
  file: File,
  accept: readonly string[] = IMAGE_ACCEPT,
  maxMb: number = MAX_UPLOAD_MB,
): string | null {
  if (!accept.includes(file.type)) {
    return 'Tipo de archivo no permitido. Sube una imagen JPG o PNG.';
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
