import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@adoptafacil/ui';
import styles from './animal-deceased-modal.module.scss';

export interface AnimalDeceasedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalName: string;
  /** Conteo REAL, derivado de los apadrinamientos ya cargados en la página que
   *  abre este modal — nunca inventado. */
  activeSponsorCount: number;
  /** Llama a `POST /animals/:id/register-death` (M07 hallazgo QA). Puede
   *  lanzar; el modal muestra el error y NO se cierra en ese caso. */
  onConfirm: () => Promise<void>;
}

/**
 * "Registrar fallecimiento" (M07 hallazgo QA en vivo, 2026-09-18): este modal
 * era, hasta ahora, un placeholder `ComingSoon` puro — no llamaba a ningún
 * endpoint. Ahora conecta de verdad: confirma y llama `onConfirm` (que a su
 * vez llama `POST /animals/:id/register-death`), el cual marca el animal
 * fallecido/inactivo y suspende sus apadrinamientos ACTIVOS.
 *
 * Reasignar el padrino a otro animal, devolver el mes en curso y notificar
 * con un mensaje PERSONALIZADO del apadrino siguen siendo una entrega futura
 * — TODO(client): el documento base no fija esas reglas de negocio (qué
 * pasa con el dinero del período en curso, a qué animal se reasigna un
 * padrino, etc.), así que esta acción solo registra el hecho y suspende el
 * apadrinamiento (mismo mecanismo que la auto-suspensión por cobro fallido,
 * S-5-REDISEÑO) con una notificación honesta: sin prometer un reembolso ni
 * una redirección automática.
 */
export function AnimalDeceasedModal({
  open,
  onOpenChange,
  animalName,
  activeSponsorCount,
  onConfirm,
}: AnimalDeceasedModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
    }
  }, [open]);

  async function handleConfirm(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent data-testid="animal-deceased-modal">
        <DialogHeader>
          <DialogTitle>Registrar fallecimiento de {animalName}</DialogTitle>
          <DialogDescription>
            {activeSponsorCount === 1
              ? `${animalName} tiene 1 padrino activo.`
              : `${animalName} tiene ${activeSponsorCount} padrinos activos.`}
          </DialogDescription>
        </DialogHeader>

        <p className={styles.intro}>
          Esta acción es definitiva: marca a {animalName} como fallecido y suspende
          {activeSponsorCount === 1 ? ' su apadrinamiento activo' : ' sus apadrinamientos activos'}.
          Reasignar padrinos, devolver el mes en curso y notificar con un mensaje personal siguen
          siendo parte de una entrega futura — por ahora, cada padrino recibe un aviso genérico y la
          organización deberá contactarlo directamente.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            className={styles['confirm-btn--danger']}
            onClick={() => void handleConfirm()}
            disabled={submitting}
          >
            {submitting ? 'Registrando…' : 'Sí, registrar fallecimiento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
