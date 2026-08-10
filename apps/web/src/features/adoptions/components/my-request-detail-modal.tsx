import type { AdoptionRequest } from '@adoptafacil/contracts';
import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@adoptafacil/ui';
import { SPECIES_LABELS } from '../../portals/model/animals-catalog';
import {
  ADOPTION_STATUS_LABELS,
  adoptionStatusVariant,
  formatBogota,
} from '../model/adoptions-view';
import { organizationLabel } from '../model/my-adoption-requests-view';

export interface MyRequestDetailModalProps {
  /** `null` cierra el modal (patrón controlado, igual que `DonationDetailModal`). */
  request: AdoptionRequest | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal de detalle de "Mis solicitudes" (REFACTOR-VISUAL Fase C2) — vista de
 * SOLO LECTURA de la propia Persona sobre su solicitud, hermana de
 * `ApplicantDetailModal` (la vista de la organización, con acciones) pero sin
 * botones de avance: quien postuló no puede cambiar el estado de su propia
 * solicitud. Muestra únicamente campos reales de `AdoptionRequest` — el mismo
 * mensaje que la Persona ya escribió al postular, no una copia nueva.
 */
export function MyRequestDetailModal({ request, onOpenChange }: MyRequestDetailModalProps) {
  return (
    <Dialog open={request !== null} onOpenChange={onOpenChange}>
      <DialogContent data-testid="my-request-detail-modal">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle>Solicitud para adoptar a {request.animalSnapshot.name}</DialogTitle>
              <DialogDescription>
                {organizationLabel(request)} · {formatBogota(request.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <Badge variant={adoptionStatusVariant(request.status)}>
                {ADOPTION_STATUS_LABELS[request.status]}
              </Badge>

              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Animal</h3>
                <p className="font-medium" data-testid="my-request-animal">
                  {request.animalSnapshot.name} · {SPECIES_LABELS[request.animalSnapshot.species]}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Tu mensaje
                </h3>
                <p className="whitespace-pre-wrap" data-testid="my-request-message">
                  {request.message}
                </p>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
