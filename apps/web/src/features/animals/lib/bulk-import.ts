import type { ApiClient } from '../../../shell/api';

/** Download the bulk-import .xlsx template and trigger a browser save (S2-04B-1). */
export async function downloadBulkImportTemplate(client: ApiClient): Promise<void> {
  const blob = await client.requestBlob('/animals/bulk-import/template');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'plantilla-animales.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** `.xlsx` only — matches the extension the template itself uses. */
export function isXlsxFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.xlsx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}
