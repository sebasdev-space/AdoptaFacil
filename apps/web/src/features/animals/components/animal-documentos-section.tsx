import { Button, EmptyState, Skeleton } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useAnimalClinicalRecord } from '../hooks/use-animal-clinical-record';
import { downloadPrivateFile } from '../lib/storage';
import { CLINICAL_TYPE_LABELS, formatClinicalDate } from '../lib/clinical-format';
import styles from './animal-detail-panel.module.scss';

interface FlatDocument {
  id: string;
  storageRef: string;
  eventType: ReturnType<typeof useAnimalClinicalRecord>['events'][number]['type'];
  eventDate: string;
}

/**
 * Contenido del tab "Documentos" (fix, T-ANIMALS-ATTACHMENTS-AUDIT) —
 * reemplaza el `ComingSoon` ("Próximamente podrás subir fotos, exámenes y
 * otros documentos del animal"): la galería consolidada de TODOS los adjuntos
 * ya registrados en el expediente clínico (fotos, exámenes, carnet de
 * vacunas), cada uno descargable (objeto PRIVADO: requiere sesión). Subir un
 * nuevo documento se hace desde "Registrar evento clínico" (tab "Registro
 * clínico"), donde se especifica a qué tipo de evento pertenece — esta
 * pestaña es la vista de solo lectura de todo lo ya adjuntado.
 */
export function AnimalDocumentosSection({ animalId }: { animalId: string }) {
  const client = useApiClient();
  const { events, eventsLoading } = useAnimalClinicalRecord(animalId);

  const documents: FlatDocument[] = events.flatMap((event) =>
    event.attachments.map((attachment) => ({
      id: attachment.id,
      storageRef: attachment.storageRef,
      eventType: event.type,
      eventDate: event.occurredAt,
    })),
  );

  const download = (storageRef: string): void => {
    // Mismo criterio que `org-documents-page.tsx`: el nombre de descarga se
    // deriva del storageRef (su propio segmento final), nunca inventado.
    const filename = storageRef.split('/').pop() ?? 'documento';
    void downloadPrivateFile(client, storageRef, filename);
  };

  if (eventsLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        title="Sin documentos todavía"
        description="Los archivos que adjuntes al registrar un evento clínico (fotos, exámenes, carnet de vacunas) aparecerán aquí."
      />
    );
  }

  return (
    <ul className={styles.timeline}>
      {documents.map((doc) => (
        <li key={doc.id} className={styles.timeline__item}>
          <span aria-hidden className={styles.timeline__marker} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className={styles.timeline__title}>{CLINICAL_TYPE_LABELS[doc.eventType]}</p>
              <p className={styles.timeline__meta}>{formatClinicalDate(doc.eventDate)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => download(doc.storageRef)}>
              Descargar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
