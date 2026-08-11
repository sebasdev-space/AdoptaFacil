import { useState } from 'react';
import type { ClinicalCarnetEntry, ClinicalEvent } from '@adoptafacil/contracts';
import { Badge, Skeleton } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { CLINICAL_TYPE_LABELS, formatClinicalDate } from '../lib/clinical-format';

/**
 * Expandable "ver ediciones anteriores" for one carnet entry — extraído de
 * `animal-clinical-panel.tsx` (S2-04B-2-REV) sin cambios de comportamiento,
 * para reutilizarlo también en la nueva sección "Carnet" del panel
 * maestro-detalle (refactor visual M03) sin duplicar la llamada al endpoint
 * `.../clinical-events/:eventId/history`.
 */
export function EventHistory({
  animalId,
  entry,
}: {
  animalId: string;
  entry: ClinicalCarnetEntry;
}) {
  const client = useApiClient();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ClinicalEvent[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async (): Promise<void> => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (history) return;
    setLoading(true);
    try {
      const list = await client.request<ClinicalEvent[]>(
        `/animals/${animalId}/clinical-events/${entry.eventId}/history`,
      );
      setHistory(list);
    } finally {
      setLoading(false);
    }
  };

  if (entry.version <= 1) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => void toggle()}
        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        {open ? 'Ocultar ediciones anteriores' : 'Ver ediciones anteriores'}
      </button>
      {open && (
        <ul className="mt-2 space-y-2 border-l border-dashed border-muted pl-3">
          {loading && <Skeleton className="h-10 w-full" />}
          {!loading &&
            history
              ?.filter((version) => version.id !== entry.id)
              .map((version) => (
                <li key={version.id} className="text-xs text-muted-foreground">
                  <Badge variant="secondary" className="mr-1">
                    v{version.version}
                  </Badge>
                  {CLINICAL_TYPE_LABELS[version.type]} · {formatClinicalDate(version.occurredAt)}
                  {version.nextDueDate && ` · Próxima: ${formatClinicalDate(version.nextDueDate)}`}
                </li>
              ))}
        </ul>
      )}
    </div>
  );
}
