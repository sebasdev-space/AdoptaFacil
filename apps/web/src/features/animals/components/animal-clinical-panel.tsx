import type { Animal, ComputedAge } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@adoptafacil/ui';
import { ClinicalEventType } from '@adoptafacil/contracts';
import { useAnimalClinicalRecord } from '../hooks/use-animal-clinical-record';
import { EventHistory } from './event-history';
import { CLINICAL_TYPE_LABELS, formatClinicalDate } from '../lib/clinical-format';

/** Same derivation shown in `animals-page.tsx`'s `ageLabel` — duplicated
 *  feature-locally (project convention, see `formatCop`/`formatBogota`)
 *  rather than shared, since it's a 6-line label with no real drift risk. */
function ageLabel(age?: ComputedAge): string {
  if (!age) return 'Edad desconocida';
  const parts: string[] = [];
  if (age.years > 0) parts.push(`${age.years} a`);
  if (age.months > 0) parts.push(`${age.months} m`);
  const text = parts.join(' ') || '0 m';
  return age.approximate ? `~${text}` : text;
}

/** S2-04B-2-REV — foto/nombre/edad header for the "Carnet" tab, requested
 *  8-ago and confirmed missing by this task's own verification step. Fetches
 *  the animal record directly (same `VIEW_ROLES` as the clinical endpoints,
 *  see `animals.controller.ts`) rather than requiring the parent route to
 *  pass it down, since `AnimalClinicalPanel` is embedded by `animalId` only. */
function CarnetHeader({ animal }: { animal: Animal | null }) {
  if (!animal) return <Skeleton className="h-16 w-full" />;
  const photo = animal.photos[0];
  return (
    <div className="flex items-center gap-4">
      {photo ? (
        <img
          src={photo}
          alt={`Foto de ${animal.name}`}
          className="h-16 w-16 shrink-0 rounded-full border border-border object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground"
        >
          {animal.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <p className="text-base font-semibold text-foreground">{animal.name}</p>
        <p className="text-sm text-muted-foreground">{ageLabel(animal.computedAge)}</p>
      </div>
    </div>
  );
}

export interface AnimalClinicalPanelProps {
  animalId: string;
}

/**
 * Expediente clínico de un animal (RF08). Ver: roles que gestionan/ven el
 * animal; registrar/editar: SOLO Veterinarian. El editar crea una nueva
 * versión.
 *
 * Embebido HOY solo por `apps/web/src/shell/pages/animal-detail-page.tsx`
 * (zona neutral de ruteo, fuera de este dominio) — su salida NO cambió con el
 * refactor visual maestro-detalle de `AnimalsPage`; ese nuevo panel reutiliza
 * el MISMO `useAnimalClinicalRecord` pero con su propia presentación (ver
 * `animal-registro-clinico-section.tsx`/`animal-carnet-section.tsx`) en vez de
 * este componente, para no tocar esta pantalla ni sus pruebas.
 */
export function AnimalClinicalPanel({ animalId }: AnimalClinicalPanelProps) {
  const {
    canEdit,
    animal,
    events,
    eventsLoading,
    carnet,
    carnetLoading,
    downloadingPdf,
    downloadPdf,
    form,
  } = useAnimalClinicalRecord(animalId);

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar evento clínico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
              Registrar
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Expediente clínico</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="registro">
            <TabsList>
              <TabsTrigger value="registro">Registro</TabsTrigger>
              <TabsTrigger value="carnet">Carnet</TabsTrigger>
            </TabsList>

            <TabsContent value="registro" className="mt-4">
              {eventsLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin eventos clínicos.</p>
              ) : (
                <ul className="space-y-3">
                  {events.map((event) => (
                    <li key={event.id} className="border-b pb-2 text-sm last:border-b-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{CLINICAL_TYPE_LABELS[event.type]}</span>
                        <Badge variant="secondary">v{event.version}</Badge>
                        <span className="text-muted-foreground">
                          {formatClinicalDate(event.occurredAt)}
                        </span>
                        {event.nextDueDate && (
                          <Badge>Próxima: {formatClinicalDate(event.nextDueDate)}</Badge>
                        )}
                        {event.attachments.length > 0 && (
                          <span className="text-muted-foreground">
                            📎 {event.attachments.length}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="carnet" className="mt-4 space-y-4">
              <CarnetHeader animal={animal} />

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
                <p className="text-sm text-muted-foreground">
                  Sin eventos clínicos registrados todavía.
                </p>
              ) : (
                <ol className="space-y-4">
                  {carnet.map((entry) => (
                    <li key={entry.id} className="border-l-2 border-primary/40 pl-4 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{CLINICAL_TYPE_LABELS[entry.type]}</span>
                        <span className="text-muted-foreground">
                          {formatClinicalDate(entry.occurredAt)}
                        </span>
                        {entry.nextDueDate && (
                          <Badge>Próxima: {formatClinicalDate(entry.nextDueDate)}</Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground">Autor: {entry.authorName}</p>
                      {entry.attachments.length > 0 && (
                        <p className="text-muted-foreground">
                          📎 {entry.attachments.length} adjunto(s)
                        </p>
                      )}
                      <EventHistory animalId={animalId} entry={entry} />
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
