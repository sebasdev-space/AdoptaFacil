import { ClinicalEventType } from '@adoptafacil/contracts';
import { Badge, Button, Input, Skeleton } from '@adoptafacil/ui';
import { useAnimalClinicalRecord } from '../hooks/use-animal-clinical-record';
import { CLINICAL_TYPE_LABELS, formatClinicalDate } from '../lib/clinical-format';
import styles from './animal-detail-panel.module.scss';

/**
 * Contenido del tab "Registro clínico" del panel maestro-detalle — MISMOS
 * datos/acciones que el tab "Registro" de `AnimalClinicalPanel` (comparten
 * `useAnimalClinicalRecord`), presentados sin el `Card`/`Tabs` propios de esa
 * pantalla porque aquí ya los provee `AnimalDetailPanel`.
 */
export function AnimalRegistroClinicoSection({ animalId }: { animalId: string }) {
  const { canEdit, events, eventsLoading, form } = useAnimalClinicalRecord(animalId);

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="space-y-3">
          <select
            aria-label="Tipo de evento"
            value={form.type}
            onChange={(e) => form.setType(e.target.value as ClinicalEventType)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {Object.values(ClinicalEventType).map((t) => (
              <option key={t} value={t}>
                {CLINICAL_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <Input
            type="date"
            aria-label="Fecha del evento"
            value={form.occurredAt}
            onChange={(e) => form.setOccurredAt(e.target.value)}
          />
          <Input
            type="date"
            aria-label="Próxima fecha (p. ej. próxima vacuna)"
            value={form.nextDueDate}
            onChange={(e) => form.setNextDueDate(e.target.value)}
          />
          <Input
            placeholder="Adjunto (nombre de archivo)"
            value={form.attachment}
            onChange={(e) => form.setAttachment(e.target.value)}
          />
          <Button disabled={form.saving} onClick={() => void form.submit()}>
            Registrar evento clínico
          </Button>
        </div>
      )}

      {eventsLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin eventos clínicos.</p>
      ) : (
        <ol className={styles.timeline}>
          {events.map((event) => (
            <li key={event.id} className={styles.timeline__item}>
              <span aria-hidden className={styles.timeline__marker} />
              <div className="flex flex-wrap items-center gap-2">
                <span className={styles.timeline__title}>{CLINICAL_TYPE_LABELS[event.type]}</span>
                <Badge variant="secondary">v{event.version}</Badge>
              </div>
              <p className={styles.timeline__meta}>
                {formatClinicalDate(event.occurredAt)}
                {event.nextDueDate && ` · Próxima: ${formatClinicalDate(event.nextDueDate)}`}
                {event.attachments.length > 0 && ` · 📎 ${event.attachments.length}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
