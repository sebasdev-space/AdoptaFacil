import type { ApiClient } from '../../../shell/api';

/**
 * Feature-local storage helper (T-109a) for animal PHOTOS. Photos are PUBLIC
 * (served openly via GET /storage/public), so display needs no auth — only the
 * upload transfers bytes (PUT /storage/upload; the shell client attaches the JWT
 * and lets the browser set the multipart boundary for a FormData body).
 *
 * Clinical attachments (fix, T-ANIMALS-ATTACHMENTS-AUDIT) are the opposite:
 * PRIVATE objects (exam results, vaccination proof — never shown in the public
 * catalog), so DOWNLOADING them needs the Bearer token (`downloadPrivateFile`
 * below, same pattern as `apps/web/src/features/org/lib/storage.ts`'s
 * legal-document download — duplicated here per this project's "small,
 * self-contained helper" convention rather than a cross-feature import).
 *
 * HANDOFF(@fabian): a reusable file-upload primitive (input + validation +
 * progress) would live in packages/ui; kept local per T-109a's UI-boundary rule.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

/** MB ceiling — coherent with the backend STORAGE_MAX_FILE_MB default (T-108). */
export const MAX_UPLOAD_MB = 15;

/** Animal photos accept images only. */
export const PHOTO_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Clinical attachments accept PDF or images (exam results, vaccination proof,
 *  evidence photos). */
export const DOCUMENT_ACCEPT = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Validate a file before uploading. Returns a plain-language error or `null`. */
export function validateUpload(
  file: File,
  accept: readonly string[] = PHOTO_ACCEPT,
  maxMb: number = MAX_UPLOAD_MB,
): string | null {
  if (!accept.includes(file.type)) {
    return accept.includes('application/pdf')
      ? 'Tipo de archivo no permitido. Sube un PDF o una imagen.'
      : 'Tipo de archivo no permitido. Sube una imagen (JPG, PNG, WEBP o GIF).';
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `El archivo supera el límite de ${maxMb} MB.`;
  }
  return null;
}

/** PUT the file bytes to a reserved storage key (auth handled by the client). */
export async function uploadFileBytes(client: ApiClient, key: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file, file.name);
  await client.request(`/storage/upload?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: form,
  });
}

/** Read the access token from the shell client's token store (same bridge as
 *  `apps/web/src/features/org/lib/storage.ts` — the shell `ApiClient` parses
 *  every response as JSON and exposes no authenticated BINARY fetch). */
function accessTokenOf(client: ApiClient): string | null {
  const bridged = client as unknown as {
    config?: { tokenStore?: { getAccessToken(): string | null } };
  };
  return bridged.config?.tokenStore?.getAccessToken() ?? null;
}

/** Download a PRIVATE clinical attachment (Bearer-authenticated) and save it
 *  locally (fix, T-ANIMALS-ATTACHMENTS-AUDIT). */
export async function downloadPrivateFile(
  client: ApiClient,
  key: string,
  filename: string,
): Promise<void> {
  const token = accessTokenOf(client);
  const response = await fetch(`${API_BASE}/storage/private?key=${encodeURIComponent(key)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`No se pudo descargar el documento (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
