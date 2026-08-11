import { Button, Skeleton } from '@adoptafacil/ui';
import { useAnimalClinicalRecord } from '../hooks/use-animal-clinical-record';
import { EventHistory } from './event-history';
import { CLINICAL_TYPE_LABELS, formatClinicalDate } from '../lib/clinical-format';
import styles from './animal-detail-panel.module.scss';

/**
 * Contenido del tab "Carnet" del panel maestro-detalle — MISMOS datos/acción
 * de descarga que el tab "Carnet" de `AnimalClinicalPanel` (comparten
 * `useAnimalClinicalRecord`/`downloadClinicalCarnetPdf`), sin repetir el
 * header foto/nombre/edad porque `AnimalDetailPanel` ya lo muestra arriba de
 * los tabs.
 */
export function AnimalCarnetSection({ animalId }: { animalId: string }) {
  const { carnet, carnetLoading, downloadingPdf, downloadPdf } = useAnimalClinicalRecord(animalId);

  return (
    <div className="space-y-4">
      <Button
        variant="outline"
        size="sm"
        disabled={downloadingPdf}
        onClick={() => void downloadPdf()}
      >
        {downloadingPdf ? 'Generando…' : 'Descargar carnet (PDF)'}
      </Button>

      {carnetLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : carnet.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin eventos clínicos registrados todavía.</p>
      ) : (
        <ol className={styles.timeline}>
          {carnet.map((entry) => (
            <li key={entry.id} className={styles.timeline__item}>
              <span aria-hidden className={styles.timeline__marker} />
              <p className={styles.timeline__title}>{CLINICAL_TYPE_LABELS[entry.type]}</p>
              <p className={styles.timeline__meta}>
                {formatClinicalDate(entry.occurredAt)} · {entry.authorName}
                {entry.nextDueDate && ` · Próxima: ${formatClinicalDate(entry.nextDueDate)}`}
                {entry.attachments.length > 0 && ` · 📎 ${entry.attachments.length} adjunto(s)`}
              </p>
              <EventHistory animalId={animalId} entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
