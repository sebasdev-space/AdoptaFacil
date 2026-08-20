import type { DonationCertificate } from '@adoptafacil/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle, cn } from '@adoptafacil/ui';
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
    <Card data-testid="certificate-document">
      <div className={styles.accent} />
      <CardHeader className="gap-2">
        <div className={styles['badge-row']}>
          <CardTitle>Certificado de donación</CardTitle>
          <Badge variant="success">ESAL · RTE vigente</Badge>
        </div>
        <p className={styles.subtitle}>
          {certificate.organizationName} · NIT {certificate.organizationNit}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className={styles.fields}>
          <div>
            <dt className={styles['fields__label']}>Donante</dt>
            <dd className={styles['fields__value']}>{certificate.donorName}</dd>
          </div>
          <div>
            <dt className={styles['fields__label']}>Monto</dt>
            <dd className={styles['fields__value']}>{formatCop(certificate.amount)}</dd>
          </div>
          <div>
            <dt className={styles['fields__label']}>Fecha de emisión</dt>
            <dd className={styles['fields__value']}>{formatBogota(certificate.issuedAt)}</dd>
          </div>
          <div>
            <dt className={styles['fields__label']}>Código único</dt>
            <dd
              className={cn(styles['fields__value'], styles['fields__value--code'])}
              data-testid="certificate-code"
            >
              {certificate.code}
            </dd>
          </div>
        </dl>

        <div className={styles['footer-row']}>
          <div className={styles.hash}>
            <p className={styles['hash__label']}>Hash del documento (SHA-256)</p>
            <p className={styles['hash__value']}>{certificate.contentHash}</p>
          </div>
          <div className={styles['qr-col']}>
            <CertificateQr value={verifyUrl} />
            <span className={styles['qr-col__caption']}>
              Escanéalo para verificar este certificado
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground" data-testid="certificate-signer-placeholder">
          Documento emitido electrónicamente por el representante legal de la organización.
        </p>
      </CardContent>
    </Card>
  );
}
