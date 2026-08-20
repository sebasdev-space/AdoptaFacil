import type { DonationCertificate, DonationCertificateVerification } from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/** El certificado de UNA donación propia (F-3, RF14) — 404 si aún no se
 *  aprueba el pago, o si la organización no es una ESAL con RTE vigente. */
export function fetchDonationCertificate(
  client: ApiClient,
  donationId: string,
): Promise<DonationCertificate> {
  return client.request<DonationCertificate>(
    `/donations/${encodeURIComponent(donationId)}/certificate`,
  );
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Verificación PÚBLICA de un certificado por su código — sin sesión. */
export async function fetchPublicCertificateVerification(
  code: string,
): Promise<DonationCertificateVerification | null> {
  const response = await fetch(
    `${API_BASE}/public/donations/certificates/${encodeURIComponent(code)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as DonationCertificateVerification;
}
