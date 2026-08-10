import {
  ComingSoon,
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
}

/**
 * "Registrar fallecimiento" (Fase 9, REFACTOR-VISUAL v2) — punto de entrada
 * para el flujo del mockup de referencia (reasignar padrino, devolver el mes
 * en curso, cerrar el expediente, notificar con un mensaje). Ese flujo
 * requiere estado/endpoints que HOY no existen (`AnimalStatus` no tiene un
 * valor "fallecido", no hay endpoint para registrarlo, y `SponsorshipsService`
 * no reacciona a ningún cambio del animal) — construirlo de verdad sería
 * agregar lógica/backend nuevo, fuera del alcance de un refactor puramente
 * visual. Por indicación explícita (2026-08-10), este modal se limita a dar
 * contexto REAL (nombre del animal, conteo real de padrinos activos) y marca
 * la acción como "Próximamente" con el primitivo `ComingSoon` — no envía ni
 * simula ningún cambio.
 */
export function AnimalDeceasedModal({
  open,
  onOpenChange,
  animalName,
  activeSponsorCount,
}: AnimalDeceasedModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          Reasignar padrinos, devolver el mes en curso y notificar con un mensaje personal son parte
          de una entrega futura.
        </p>
        <ComingSoon
          icon={<span aria-hidden>🕊️</span>}
          title="Disponible próximamente"
          description="El registro de fallecimiento y sus opciones para los padrinos aún no están conectados."
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
