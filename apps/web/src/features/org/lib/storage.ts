import type { ApiClient } from '../../../shell/api';

/**
 * Feature-local storage helpers (T-109a). Wire the real byte transfer to the
 * T-108 backend endpoints:
 *   - upload  → PUT /storage/upload?key=…  (multipart; the shell client attaches
 *               the JWT and, with a FormData body, lets the browser set the
 *               multipart boundary itself).
 *   - private download → GET /storage/private?key=…  (needs the Bearer token).
 *
 * HANDOFF(@fabian): the shell ApiClient parses every response as JSON and does
 * not expose an authenticated BINARY fetch nor the access token, so a private
 * file cannot be downloaded through it. A shared `ApiClient.requestBlob(path)`
 * (or a token accessor) belongs in the shell. Until then we bridge to the
 * client's in-memory token store below; this is the single place to update.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

/** MB ceiling — coherent with the backend STORAGE_MAX_FILE_MB default (T-108). */
export const MAX_UPLOAD_MB = 15;

/** Legal documents accept PDF or images. */
export const DOCUMENT_ACCEPT = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/**
 * Validate a file before uploading. Returns a plain-language error message
 * (RNF09) or `null` when the file is acceptable.
 */
export function validateUpload(
  file: File,
  accept: readonly string[],
  maxMb: number = MAX_UPLOAD_MB,
): string | null {
  if (!accept.includes(file.type)) {
    return 'Tipo de archivo no permitido. Sube un PDF o una imagen.';
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

/** Read the access token from the shell client's token store (see HANDOFF). */
function accessTokenOf(client: ApiClient): string | null {
  const bridged = client as unknown as {
    config?: { tokenStore?: { getAccessToken(): string | null } };
  };
  return bridged.config?.tokenStore?.getAccessToken() ?? null;
}

/** Download a PRIVATE document (Bearer-authenticated) and save it locally. */
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
