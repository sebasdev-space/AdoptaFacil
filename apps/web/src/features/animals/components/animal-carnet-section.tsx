import { useEffect, useState } from 'react';
import type { Animal, AnimalCardInfo } from '@adoptafacil/contracts';
import { Button, Skeleton } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useAnimalClinicalRecord } from '../hooks/use-animal-clinical-record';
import { AnimalIdCard } from './animal-id-card';
import { EventHistory } from './event-history';
import { CLINICAL_TYPE_LABELS, formatClinicalDate } from '../lib/clinical-format';
import styles from './animal-detail-panel.module.scss';

/**
 * Contenido del tab "Carnet" del panel maestro-detalle: la TARJETA de
 * identificación del animal (frente y reverso, mismo diseño que la hoja 1 del PDF)
 * y debajo el historial clínico — MISMOS datos/acción
 * de descarga que el tab "Carnet" de `AnimalClinicalPanel` (comparten
 * `useAnimalClinicalRecord`/`downloadClinicalCarnetPdf`), sin repetir el
 * header foto/nombre/edad porque `AnimalDetailPanel` ya lo muestra arriba de
 * los tabs.
 */
export function AnimalCarnetSection({ animal }: { animal: Animal }) {
  const animalId = animal.id;
  const client = useApiClient();
  const { carnet, carnetLoading, downloadingPdf, downloadPdf } = useAnimalClinicalRecord(animalId);

  // Código N° y URL del QR: los calcula el servidor (mismo origen que el PDF).
  const [card, setCard] = useState<AnimalCardInfo | null>(null);
  useEffect(() => {
    let active = true;
    setCard(null);
    client
      .request<AnimalCardInfo>(`/animals/${animalId}/clinical-events/card`)
      .then((info) => {
        // Solo una respuesta con la forma esperada (nunca datos a medias en la tarjeta).
        if (active && typeof info?.code === 'string' && typeof info?.profileUrl === 'string') {
          setCard(info);
        }
      })
      .catch(() => undefined); // sin datos del carnet: se omite la tarjeta, el resto sigue.
    return () => {
      active = false;
    };
  }, [client, animalId]);

  return (
    <div className="space-y-4">
      {card ? (
        <AnimalIdCard animal={animal} code={card.code} profileUrl={card.profileUrl} />
      ) : (
        <Skeleton className="h-[460px] w-full" />
      )}

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
