import { useEffect, useState } from 'react';
import {
  DocumentStatus,
  DocumentType,
  Role,
  type OrganizationDocument,
  type UploadOrganizationDocumentResult,
  type VerificationLevel,
} from '@adoptafacil/contracts';
import {
  Badge,
  type BadgeProps,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { DocumentTypeIcon, UploadCloudIcon } from '../components/document-icons';
import { TextField } from '../components/profile-fields';
import {
  DOCUMENT_ACCEPT,
  downloadPrivateFile,
  uploadFileBytes,
  validateUpload,
} from '../lib/storage';
import styles from './org-documents-page.module.scss';

const DOC_TYPES = Object.values(DocumentType) as DocumentType[];

const TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.ExistenceRepresentationCertificate]:
    'Certificado de existencia y representación legal',
  [DocumentType.Rut]: 'RUT',
  [DocumentType.LegalRepresentativeId]: 'Documento del representante legal',
  [DocumentType.Other]: 'Otro documento',
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.Pending]: 'Pendiente',
  [DocumentStatus.UnderReview]: 'En revisión',
  [DocumentStatus.Observed]: 'Observado',
  [DocumentStatus.Approved]: 'Aprobado',
  [DocumentStatus.Rejected]: 'Rechazado',
  [DocumentStatus.Expired]: 'Vencido',
};

const STATUS_BADGE_VARIANT: Record<DocumentStatus, BadgeProps['variant']> = {
  [DocumentStatus.Pending]: 'warning',
  [DocumentStatus.UnderReview]: 'warning',
  [DocumentStatus.Observed]: 'destructive',
  [DocumentStatus.Approved]: 'success',
  [DocumentStatus.Rejected]: 'destructive',
  [DocumentStatus.Expired]: 'destructive',
};

/** Card border/background per status — dashed+muted for "sin subir" is handled
 *  separately (no document yet). */
const STATUS_CARD_CLASSES: Record<DocumentStatus, string> = {
  [DocumentStatus.Pending]: styles['doc-card--pending'],
  [DocumentStatus.UnderReview]: styles['doc-card--under_review'],
  [DocumentStatus.Observed]: styles['doc-card--observed'],
  [DocumentStatus.Approved]: styles['doc-card--approved'],
  [DocumentStatus.Rejected]: styles['doc-card--rejected'],
  [DocumentStatus.Expired]: styles['doc-card--expired'],
};

/** Formatea un instante UTC en hora de Colombia para la UI. */
function formatCO(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—';
}

/** The current (highest-version) document per type, or `undefined` when a type
 *  has never been uploaded. Older versions stay in `documents` (history) but are
 *  not the card's representative. */
function latestByType(
  documents: OrganizationDocument[],
): Partial<Record<DocumentType, OrganizationDocument>> {
  const latest: Partial<Record<DocumentType, OrganizationDocument>> = {};
  for (const doc of documents) {
    const current = latest[doc.type];
    if (!current || doc.version > current.version) {
      latest[doc.type] = doc;
    }
  }
  return latest;
}

/** `/organizacion/documentos` — gestión documental (RF03). Owner/Administrator
 *  suben/renuevan; Owner/Administrator/ReadOnlyAuditor consultan. El vencimiento
 *  se refleja en el estado (Vencido) y en el nivel de verificación.
 *
 *  Pulido UX (T-D04): grid de tarjetas por tipo de documento (una por cada
 *  `DocumentType`) con estado visual, en vez de un dropdown genérico + lista
 *  plana. La subida sigue exactamente el mismo endpoint/flujo de antes — solo
 *  cambia cómo se elige el tipo (preseleccionado por la tarjeta en la que se
 *  hace clic) y dónde vive el formulario (un diálogo). */
export function OrgDocumentsPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator);
  const { toast } = useToast();

  const [documents, setDocuments] = useState<OrganizationDocument[]>([]);
  const [verification, setVerification] = useState<VerificationLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadType, setUploadType] = useState<DocumentType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const [docs, level] = await Promise.all([
      client.request<OrganizationDocument[]>('/org/documents'),
      client.request<VerificationLevel>('/org/documents/verification'),
    ]);
    setDocuments(docs);
    setVerification(level);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [docs, level] = await Promise.all([
          client.request<OrganizationDocument[]>('/org/documents'),
          client.request<VerificationLevel>('/org/documents/verification'),
        ]);
        if (active) {
          setDocuments(docs);
          setVerification(level);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const openUpload = (type: DocumentType): void => {
    setUploadType(type);
    setFile(null);
    setExpiresAt('');
  };

  const closeUpload = (): void => {
    setUploadType(null);
    setFile(null);
    setExpiresAt('');
  };

  const submit = async (): Promise<void> => {
    if (!uploadType) return;
    if (!file) {
      toast({
        title: 'Archivo requerido',
        description: 'Selecciona un archivo (PDF o imagen).',
        variant: 'warning',
      });
      return;
    }
    const invalid = validateUpload(file, DOCUMENT_ACCEPT);
    if (invalid) {
      toast({ title: 'Archivo no válido', description: invalid, variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      // 1) Reserve the versioned document + a private storage key (T-103).
      const reserved = await client.request<UploadOrganizationDocumentResult>('/org/documents', {
        method: 'POST',
        json: {
          type: uploadType,
          filename: file.name,
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        },
      });
      // 2) Send the real bytes to the reserved key (T-108).
      await uploadFileBytes(client, reserved.upload.key, file);
      closeUpload();
      await load();
      toast({
        title: 'Documento subido',
        description: 'Nueva versión enviada a revisión.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo subir el documento',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const download = async (doc: OrganizationDocument): Promise<void> => {
    setDownloading(doc.id);
    try {
      const name = doc.storageRef.split('/').pop() ?? `${doc.type}-v${doc.version}`;
      await downloadPrivateFile(client, doc.storageRef, name);
    } catch (error) {
      toast({
        title: 'No se pudo descargar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(null);
    }
  };

  const byType = latestByType(documents);
  const showFriendlyVerificationHint =
    verification !== null && verification.level === 0 && documents.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Documentos"
        description="Gestión documental con versionamiento y niveles de verificación."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-6">
          {verification && (
            <Card>
              <CardHeader>
                <CardTitle>Nivel de verificación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {showFriendlyVerificationHint ? (
                  <p className={styles['verification-hint']}>
                    Sube tus documentos para iniciar la verificación.
                  </p>
                ) : (
                  <>
                    <Badge>{verification.label ?? `Nivel ${verification.level}`}</Badge>
                    {verification.blockedBy && verification.blockedBy.length > 0 && (
                      <p className={styles['verification-hint']}>
                        Para el nivel {verification.nextLevel} faltan (o están vencidos):{' '}
                        {verification.blockedBy
                          .map((t) => TYPE_LABELS[t as DocumentType] ?? t)
                          .join(', ')}
                        .
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <div className={styles['doc-grid']}>
            {DOC_TYPES.map((type) => {
              const doc = byType[type];
              return (
                <Card
                  key={type}
                  className={doc ? STATUS_CARD_CLASSES[doc.status] : styles['doc-card--empty']}
                >
                  <CardContent className="space-y-3 p-4">
                    <div className={styles['doc-card__header']}>
                      <DocumentTypeIcon
                        type={type}
                        className={cn('h-6 w-6', styles['doc-card__icon'])}
                      />
                      <span className={styles['doc-card__label']}>{TYPE_LABELS[type]}</span>
                    </div>

                    {doc ? (
                      <>
                        <div className={styles['doc-card__meta']}>
                          <Badge variant={STATUS_BADGE_VARIANT[doc.status]}>
                            {STATUS_LABELS[doc.status]}
                          </Badge>
                          <span className={styles['doc-card__version']}>v{doc.version}</span>
                        </div>
                        {doc.expiresAt && (
                          <p className={styles['doc-card__expiry']}>
                            Vence: {formatCO(doc.expiresAt)}
                          </p>
                        )}
                        {doc.reviewNote && (
                          <p className={styles['doc-card__note']}>Motivo: {doc.reviewNote}</p>
                        )}
                        <div className={styles['doc-card__actions']}>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={downloading === doc.id}
                            onClick={() => void download(doc)}
                          >
                            Ver documento
                          </Button>
                          {canManage && (
                            <Button size="sm" variant="outline" onClick={() => openUpload(type)}>
                              Actualizar
                            </Button>
                          )}
                        </div>
                      </>
                    ) : canManage ? (
                      <button
                        type="button"
                        onClick={() => openUpload(type)}
                        className={styles['doc-card__upload-btn']}
                      >
                        <UploadCloudIcon className="h-6 w-6" />
                        Sin subir
                      </button>
                    ) : (
                      <p className={styles['doc-card__empty-text']}>Sin subir</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={uploadType !== null} onOpenChange={(open) => !open && closeUpload()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {uploadType ? `Subir ${TYPE_LABELS[uploadType]}` : 'Subir documento'}
            </DialogTitle>
            <DialogDescription>
              El tipo de documento ya está seleccionado. Arrastra tu archivo aquí o haz clic para
              seleccionarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className={styles['upload-field']}>
              <label htmlFor="doc-file" className={styles['upload-field__label']}>
                Archivo (PDF o imagen, máx. 15 MB)
              </label>
              <input
                id="doc-file"
                type="file"
                accept={DOCUMENT_ACCEPT.join(',')}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className={styles['upload-field__input']}
              />
              {file && (
                <p className={styles['upload-field__selected']}>Seleccionado: {file.name}</p>
              )}
            </div>
            <TextField
              id="doc-expires"
              label="Vence (opcional)"
              type="date"
              value={expiresAt}
              onChange={setExpiresAt}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeUpload}>
              Cancelar
            </Button>
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? 'Subiendo…' : 'Subir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
