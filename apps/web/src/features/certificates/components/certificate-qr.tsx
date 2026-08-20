import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export interface CertificateQrProps {
  /** URL que el QR debe codificar (F-3, RF14: la verificación pública real del
   *  certificado — ya no una URL fija de muestra). */
  value: string;
  /** Tamaño en px del lado del QR. */
  size?: number;
}

/**
 * QR REAL y DINÁMICO (F-3, reemplaza el SVG estático de muestra de T-053):
 * codifica la URL de verificación pública de ESTE certificado
 * (`/verificar/<code>`), generado en el navegador con la librería `qrcode`
 * (MIT, sin dependencias nativas). Mientras genera, muestra un placeholder
 * neutro — nunca un QR a medio construir.
 */
export function CertificateQr({ value, size = 128 }: CertificateQrProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDataUrl(null);
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        // Best-effort: si falla la generación, el placeholder se queda (nunca
        // un QR roto ni uno inventado).
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        aria-hidden
        style={{ width: size, height: size }}
        className="animate-pulse rounded-sm border border-border bg-muted"
      />
    );
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt={`Código QR: verifica este certificado en ${value}`}
      data-testid="certificate-qr"
      className="rounded-sm border border-border bg-white p-1"
    />
  );
}
