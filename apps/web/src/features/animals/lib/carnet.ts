import type { ApiClient } from '../../../shell/api';

/** Download the "carnet de vacunación" PDF and trigger a browser save (S2-04B-2). */
export async function downloadClinicalCarnetPdf(
  client: ApiClient,
  animalId: string,
  animalName?: string,
): Promise<void> {
  const blob = await client.requestBlob(`/animals/${animalId}/clinical-events/carnet.pdf`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const slug = animalName ? animalName.toLowerCase().replace(/\s+/g, '-') : animalId;
  anchor.download = `carnet-${slug}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
