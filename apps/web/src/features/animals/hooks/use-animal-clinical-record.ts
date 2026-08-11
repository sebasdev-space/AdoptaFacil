import { useEffect, useState } from 'react';
import {
  type Animal,
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

/**
 * Datos + acciones del expediente clínico de un animal (RF08), extraído de
 * `animal-clinical-panel.tsx` para reutilizarlo TAMBIÉN en las nuevas
 * secciones "Registro clínico"/"Carnet" del panel maestro-detalle (refactor
 * visual M03), sin duplicar los fetches ni la lógica de registro/descarga.
 * `AnimalClinicalPanel` (embebido por `apps/web/src/shell/pages/
 * animal-detail-page.tsx`, fuera de este dominio) sigue consumiendo este
 * mismo hook — su salida no cambia.
 */
export function useAnimalClinicalRecord(animalId: string) {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canEdit = hasRole(Role.Veterinarian);
  const { toast } = useToast();

  const [events, setEvents] = useState<ClinicalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [type, setType] = useState<ClinicalEventType>(ClinicalEventType.Vaccine);
  const [occurredAt, setOccurredAt] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [attachment, setAttachment] = useState('');
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
      const body: CreateClinicalEventInput = {
        type,
        occurredAt: new Date(occurredAt).toISOString(),
        ...(nextDueDate ? { nextDueDate: new Date(nextDueDate).toISOString() } : {}),
        ...(attachment.trim() ? { attachments: [{ filename: attachment.trim() }] } : {}),
      };
      await client.request<ClinicalEvent>(base, { method: 'POST', json: body });
      setOccurredAt('');
      setNextDueDate('');
      setAttachment('');
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
      attachment,
      setAttachment,
      saving,
      submit,
    },
  };
}
