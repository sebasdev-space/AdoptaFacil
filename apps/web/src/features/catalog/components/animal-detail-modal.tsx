import type { PublicAnimalSummary } from '@adoptafacil/contracts';
import { Dialog, DialogContent, DialogTitle } from '@adoptafacil/ui';
import { AnimalDetailInfo } from '../../portals/components/animal-detail-info';
import { AnimalDetailActions } from '../../portals/components/animal-detail-actions';

export interface AnimalDetailModalProps {
  animal: PublicAnimalSummary | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Vista modal del detalle de un animal, abierta desde una tarjeta del
 * catálogo general (pulido visual — antes navegaba a la página completa
 * `/o/:slug/animales/:animalId`, T-052). Reutiliza `AnimalDetailInfo`/
 * `AnimalDetailActions` TAL CUAL (mismos datos/rutas que la página completa,
 * que sigue existiendo para deep-links) — solo cambia el contenedor visual.
 *
 * Layout pedido: todas las acciones (Solicitar adopción/Apadrinar) ancladas
 * abajo, en una franja separada por una línea; el único control en la
 * esquina superior derecha es la X para cerrar — ya es el comportamiento
 * POR DEFECTO de `DialogContent` (no se agrega ningún otro botón de header).
 * El animal ya trae su organización embebida (`PublicAnimalSummary.organization`,
 * catálogo global S1-07) — no hace falta el fetch aparte que sí necesita la
 * página completa para resolver el nombre de la organización.
 */
export function AnimalDetailModal({ animal, onOpenChange }: AnimalDetailModalProps) {
  return (
    <Dialog open={animal !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        {/* Título accesible para lectores de pantalla (Radix lo requiere);
            visualmente oculto porque el pedido es "sin chrome de header",
            solo la X — el nombre del animal ya aparece dentro del contenido. */}
        <DialogTitle className="sr-only">
          {animal ? `Detalle de ${animal.name}` : 'Detalle del animal'}
        </DialogTitle>
        {animal && (
          <>
            <div className="overflow-y-auto">
              <AnimalDetailInfo animal={animal} />
            </div>
            <div className="border-t border-border p-4" data-testid="animal-detail-modal-actions">
              <AnimalDetailActions animal={animal} orgName={animal.organization.name} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
