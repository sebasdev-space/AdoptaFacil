import type { DonationCertificate } from '@adoptafacil/contracts';
import { Badge, Card, CardContent, CardTitle, cn } from '@adoptafacil/ui';
import { certificateVerifyPath, formatBogota, formatCop } from '../model/certificate-format';
import { CertificateQr } from './certificate-qr';
import styles from './certificate-document.module.scss';

export interface CertificateDocumentProps {
  certificate: DonationCertificate;
}

/**
 * Plantilla VISUAL del certificado de donación REAL (RF14, F-3). Solo se emite
 * para una ESAL con RTE vigente (gating del backend — este componente confía
 * en que si recibe un certificado, ya pasó ese filtro). El QR codifica la
 * verificación pública real de ESTE certificado.
 *
 * TODO(S-1, @sebastian): el firmante (representante legal / revisor fiscal)
 * no se modela todavía — cuando exista `LegalRepresentative` real, esta
 * plantilla mostrará su nombre en vez del texto genérico de abajo.
 */
export function CertificateDocument({ certificate }: CertificateDocumentProps) {
  const verifyUrl = `${window.location.origin}${certificateVerifyPath(certificate.code)}`;

  return (
    <Card data-testid="certificate-document" className={styles.certificate}>
      <div className={styles.accent} />
      <CardContent className={styles.content}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>AdoptaFácil</p>
          <CardTitle className={styles.title}>Certificado de donación</CardTitle>
          <Badge variant="success">ESAL · RTE vigente</Badge>
        </header>

        <section className={styles.issuer} aria-label="Organización beneficiaria">
          <p className={styles.issuer__name}>{certificate.organizationName}</p>
          <p className={styles.issuer__nit}>NIT {certificate.organizationNit}</p>
        </section>

        <section className={styles.statement} aria-label="Donación certificada">
          <p className={styles.statement__lead}>Certifica que</p>
          <p className={styles.statement__donor}>{certificate.donorName}</p>
          <p className={styles.statement__lead}>realizó una donación por</p>
          <p className={styles.statement__amount}>{formatCop(certificate.amount)}</p>
        </section>

        <dl className={styles.meta}>
          <div className={styles.meta__item}>
            <dt className={styles.label}>Fecha de emisión</dt>
            <dd className={styles.meta__value}>{formatBogota(certificate.issuedAt)}</dd>
          </div>
          <div className={styles.meta__item}>
            <dt className={styles.label}>Código único</dt>
            <dd
              className={cn(styles.meta__value, styles['meta__value--code'])}
              data-testid="certificate-code"
            >
              {certificate.code}
            </dd>
          </div>
        </dl>

        <footer className={styles.footer}>
          <div className={styles.qr}>
            <CertificateQr value={verifyUrl} size={112} />
            <span className={styles.qr__caption}>Escanéalo para verificar</span>
          </div>
          <div className={styles.hash}>
            <p className={styles.label}>Hash del documento (SHA-256)</p>
            <p className={styles.hash__value}>{certificate.contentHash}</p>
            <p className={styles.signer} data-testid="certificate-signer-placeholder">
              Documento emitido electrónicamente por el representante legal de la organización.
            </p>
          </div>
        </footer>
      </CardContent>
    </Card>
  );
}
