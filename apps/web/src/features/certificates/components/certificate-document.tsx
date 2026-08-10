import { Badge, Card, CardContent, CardHeader, CardTitle, cn } from '@adoptafacil/ui';
import { formatBogota, formatCop, type MockCertificate } from '../model/mock-certificate';
import { CertificateQr } from './certificate-qr';
import styles from './certificate-document.module.scss';

export interface CertificateDocumentProps {
  certificate: MockCertificate;
}

/**
 * Plantilla VISUAL del certificado de donación (§M05/RF14, maqueta T-053). Muestra
 * el emisor —una ESAL con RTE vigente, fiel al gating conceptual del RF14—, los datos
 * de la donación, el CÓDIGO ÚNICO verificable, el HASH de muestra y el QR de muestra.
 * Todo es de EJEMPLO (ver mock-certificate). No implementa generación ni gating real.
 */
export function CertificateDocument({ certificate }: CertificateDocumentProps) {
  return (
    <Card data-testid="certificate-document">
      <div className={styles.accent} />
      <CardHeader className="gap-2">
        <div className={styles['badge-row']}>
          <CardTitle>Certificado de donación</CardTitle>
          {/* Gating conceptual RF14: el certificado es SOLO para ESAL con RTE.
              F1-03-COMPLETO: el cruce reportado sobre el contraste de
              `variant="success"` (~4.10:1) ya fue resuelto por F-BADGE en
              `packages/ui/src/styles/globals.css` (~4.80:1, verificado de nuevo
              en REFACTOR-VISUAL Fase A) — nada que hacer aquí. */}
          <Badge variant="success">ESAL · RTE vigente</Badge>
        </div>
        <p className={styles.subtitle}>
          {certificate.organizationName}
          {certificate.organizationNit && ` · NIT ${certificate.organizationNit}`}
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
            <p className={styles['hash__label']}>Hash del documento (muestra)</p>
            <p className={styles['hash__value']}>{certificate.contentHash}</p>
          </div>
          <div className={styles['qr-col']}>
            <CertificateQr />
            <span className={styles['qr-col__caption']}>Escanéalo para visitar AdoptaFácil</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
