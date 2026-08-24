import type { ApiClient } from '../../../shell/api';

/** Download a volunteer certificate PDF and trigger a browser save (RF18/RF19),
 *  same technique as `downloadClinicalCarnetPdf` (M03). */
export async function downloadVolunteerCertificatePdf(
  client: ApiClient,
  certificateId: string,
): Promise<void> {
  const blob = await client.requestBlob(`/volunteer-certificates/${certificateId}/pdf`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `certificado-voluntariado-${certificateId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
