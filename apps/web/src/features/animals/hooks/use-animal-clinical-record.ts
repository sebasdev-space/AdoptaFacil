import { useEffect, useState } from 'react';
import {
  type Animal,
  type ClinicalAttachmentUploadTarget,
  type ClinicalCarnetEntry,
  type ClinicalEvent,
  ClinicalEventType,
  type CreateClinicalEventInput,
  Role,
} from '@adoptafacil/contracts';
import { useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { downloadClinicalCarnetPdf } from '../lib/carnet';
import { DOCUMENT_ACCEPT, uploadFileBytes, validateUpload } from '../lib/storage';

/**
 * Datos + acciones del expediente clínico de un animal (RF08), extraído de
 * `animal-clinical-panel.tsx` para reutilizarlo TAMBIÉN en las nuevas
 * secciones "Registro clínico"/"Carnet" del panel maestro-detalle (refactor
 * visual M03), sin duplicar los fetches ni la lógica de registro/descarga.
 * `AnimalClinicalPanel` (embebido por `apps/web/src/shell/pages/
 * animal-detail-page.tsx`, fuera de este dominio) sigue consumiendo este
 * mismo hook — su salida no cambia.
 *
 * Fix (T-ANIMALS-ATTACHMENTS-AUDIT, 2026-10): `canEdit` widened from
 * Veterinarian-only to the same write roles as the rest of the animal record
 * (Owner/Administrator/Operator/Veterinarian) — confirmed with the client
 * that the Owner should be able to register a clinical event too. `form`
 * now carries REAL files (`files`/`addFile`/`removeFile`) instead of a bare
 * "adjunto (nombre de archivo)" text field that never uploaded any bytes —
 * `submit()` reserves a storage target per file (`POST .../uploads`), PUTs
 * each file's bytes, and only then creates the event with the resulting
 * `storageRef`s.
 */
export function useAnimalClinicalRecord(animalId: string) {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  const canEdit = hasAnyRole(Role.Owner, Role.Administrator, Role.Operator, Role.Veterinarian);
  const { toast } = useToast();

  const [events, setEvents] = useState<ClinicalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [type, setType] = useState<ClinicalEventType>(ClinicalEventType.Vaccine);
  const [occurredAt, setOccurredAt] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const [carnet, setCarnet] = useState<ClinicalCarnetEntry[]>([]);
  const [carnetLoading, setCarnetLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [animal, setAnimal] = useState<Animal | null>(null);

  const base = `/animals/${animalId}/clinical-events`;

  const load = async (): Promise<void> => {
    const list = await client.request<ClinicalEvent[]>(base);
    setEvents(list);
    setEventsLoading(false);
  };

  const loadCarnet = async (): Promise<void> => {
    const list = await client.request<ClinicalCarnetEntry[]>(`${base}/carnet`);
    setCarnet(list);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await client.request<ClinicalEvent[]>(base);
        if (active) setEvents(list);
      } finally {
        if (active) setEventsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, base]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await client.request<ClinicalCarnetEntry[]>(`${base}/carnet`);
        if (active) setCarnet(list);
      } finally {
        if (active) setCarnetLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, base]);

  useEffect(() => {
    let active = true;
    void client
      .request<Animal>(`/animals/${animalId}`)
      .then((data) => {
        if (active) setAnimal(data);
      })
      .catch(() => {
        // Header/CarnetHeader es un plus junto al timeline; que falle este
        // fetch no debe bloquear Registro/Carnet (regresión cero).
      });
    return () => {
      active = false;
    };
  }, [client, animalId]);

  async function downloadPdf(): Promise<void> {
    setDownloadingPdf(true);
    try {
      await downloadClinicalCarnetPdf(client, animalId);
    } catch (error) {
      toast({
        title: 'No se pudo descargar el carnet',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingPdf(false);
    }
  }

  /** Validates + queues a file for upload on the next `submit()` — the actual
   *  reserve+PUT only happens then, same deferred-upload pattern already used
   *  by `AnimalPhotoField` on animal CREATE. */
  const addFile = (file: File): void => {
    const error = validateUpload(file, DOCUMENT_ACCEPT);
    if (error) {
      toast({ title: 'Archivo no válido', description: error, variant: 'warning' });
      return;
    }
    setFiles((prev) => [...prev, file]);
  };

  const removeFile = (index: number): void => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async (): Promise<void> => {
    if (!occurredAt) {
      toast({
        title: 'Fecha requerida',
        description: 'Indica la fecha del evento.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      // Reserve a storage target + PUT the bytes for each file BEFORE creating
      // the event — only a confirmed, already-uploaded storageRef is ever sent.
      const attachments = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const target = await client.request<ClinicalAttachmentUploadTarget>(`${base}/uploads`, {
          method: 'POST',
          json: { filename: file.name, contentType: file.type },
        });
        await uploadFileBytes(client, target.key, file);
        attachments.push({ storageRef: target.key, order: index });
      }

      const body: CreateClinicalEventInput = {
        type,
        occurredAt: new Date(occurredAt).toISOString(),
        ...(nextDueDate ? { nextDueDate: new Date(nextDueDate).toISOString() } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      };
      await client.request<ClinicalEvent>(base, { method: 'POST', json: body });
      setOccurredAt('');
      setNextDueDate('');
      setFiles([]);
      await Promise.all([load(), loadCarnet()]);
      toast({ title: 'Evento clínico registrado' });
    } catch (error) {
      toast({
        title: 'No se pudo registrar el evento',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    canEdit,
    animal,
    events,
    eventsLoading,
    carnet,
    carnetLoading,
    downloadingPdf,
    downloadPdf,
    form: {
      type,
      setType,
      occurredAt,
      setOccurredAt,
      nextDueDate,
      setNextDueDate,
      files,
      addFile,
      removeFile,
      saving,
      submit,
    },
  };
}
