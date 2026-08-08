export interface CertificateQrProps {
  /** Tamaño en px del lado del QR. */
  size?: number;
}

/**
 * QR REAL (F-CERT-REAL) que codifica `https://adoptafacil.org/` — NO el código del
 * certificado ni una promesa de verificación (eso sigue siendo RF14, post-pitch).
 * Generado una sola vez con el CLI de `qrcode` (vía `npx`, SIN añadirlo como
 * dependencia del proyecto) para esa URL fija y embebido aquí como SVG estático —
 * mismo enfoque sin-dependencias que ya usaba el QR decorativo que reemplaza
 * (`sample-qr.tsx`). Colores fijos (negro/blanco, no tokens de tema) para que siga
 * siendo escaneable en cualquier tema, como cualquier QR impreso.
 */
export function CertificateQr({ size = 128 }: CertificateQrProps) {
  return (
    <svg
      role="img"
      aria-label="Código QR: escanea para visitar adoptafacil.org"
      data-testid="certificate-qr"
      width={size}
      height={size}
      viewBox="0 0 27 27"
      shapeRendering="crispEdges"
      className="rounded-sm border border-border bg-white p-1"
    >
      <path fill="#ffffff" d="M0 0h27v27H0z" />
      <path
        stroke="#000000"
        d="M1 1.5h7m1 0h1m2 0h1m1 0h1m2 0h1m1 0h7M1 2.5h1m5 0h1m1 0h1m1 0h2m2 0h1m1 0h1m1 0h1m5 0h1M1 3.5h1m1 0h3m1 0h1m3 0h1m1 0h5m1 0h1m1 0h3m1 0h1M1 4.5h1m1 0h3m1 0h1m1 0h8m2 0h1m1 0h3m1 0h1M1 5.5h1m1 0h3m1 0h1m2 0h1m1 0h1m1 0h4m1 0h1m1 0h3m1 0h1M1 6.5h1m5 0h1m3 0h1m2 0h2m3 0h1m5 0h1M1 7.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M9 8.5h2m2 0h1m1 0h1M1 9.5h1m1 0h2m1 0h3m2 0h2m4 0h1m1 0h1m2 0h1m1 0h2M3 10.5h2m3 0h3m3 0h1m2 0h1m2 0h1m3 0h1M1 11.5h1m1 0h3m1 0h2m2 0h2m1 0h1m5 0h2M1 12.5h2m1 0h1m1 0h1m1 0h1m1 0h2m1 0h2m1 0h1m3 0h1m1 0h2M1 13.5h12m1 0h3m1 0h2m1 0h1m1 0h3M5 14.5h1m2 0h2m1 0h2m1 0h8m3 0h1M2 15.5h2m1 0h1m1 0h1m5 0h1m1 0h1m2 0h2m1 0h1m1 0h2M1 16.5h1m1 0h2m4 0h2m2 0h1m1 0h2m1 0h1m1 0h2m3 0h1M4 17.5h1m2 0h1m4 0h1m1 0h1m2 0h9M9 18.5h1m1 0h1m1 0h3m1 0h1m3 0h1m1 0h1m1 0h1M1 19.5h7m1 0h2m1 0h3m2 0h1m1 0h1m1 0h1m1 0h3M1 20.5h1m5 0h1m1 0h1m1 0h1m1 0h1m1 0h3m3 0h1m2 0h1M1 21.5h1m1 0h3m1 0h1m4 0h1m2 0h1m1 0h6m2 0h1M1 22.5h1m1 0h3m1 0h1m1 0h3m1 0h1m2 0h1m1 0h2m1 0h5M1 23.5h1m1 0h3m1 0h1m1 0h2m1 0h3m1 0h1m2 0h1m1 0h1m1 0h2M1 24.5h1m5 0h1m4 0h5m4 0h1m1 0h1M1 25.5h7m1 0h6m4 0h7"
      />
    </svg>
  );
}
