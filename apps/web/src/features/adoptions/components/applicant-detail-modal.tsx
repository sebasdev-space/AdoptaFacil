import type { AdoptionRequest, AdoptionStatus } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@adoptafacil/ui';
import { SPECIES_LABELS } from '../../portals/model/animals-catalog';
import {
  ADOPTION_NEXT_STATUSES,
  ADOPTION_STATUS_LABELS,
  adoptionStatusVariant,
  formatBogota,
} from '../model/adoptions-view';

export interface ApplicantDetailModalProps {
  /** `null` cierra el modal (patrón controlado, igual que el resto del proyecto). */
  request: AdoptionRequest | null;
  onOpenChange: (open: boolean) => void;
  onAdvance: (request: AdoptionRequest, targetStatus: AdoptionStatus) => void;
  /** Id de la solicitud con una transición en curso (deshabilita sus botones). */
  movingId: string | null;
}

/**
 * Modal de detalle del solicitante (F-MODAL-SOLICITANTE), paso previo a avanzar
 * una solicitud desde el kanban de evaluación (§M04). Muestra ÚNICAMENTE datos
 * REALES que `AdoptionRequest` ya expone — identidad y contacto del solicitante
 * (`applicant`), su mensaje de motivación completo (la tarjeta lo trunca a 3
 * líneas), el animal solicitado (`animalSnapshot`) y el estado/fecha. No hay
 * preguntas separadas de "condiciones de vivienda" o "experiencia" en el
 * formulario real (`AdoptionRequestPage` solo pide nombre/correo/teléfono/un
 * mensaje) — mostrarlas sería inventar datos que el contrato no trae, así que no
 * se fabrican. Las acciones de avanzar reutilizan EXACTAMENTE el mismo handler
 * que ya usan los botones de la tarjeta (`onAdvance` = `move` del kanban); esto
 * es solo una vista de detalle, la lógica de transición no cambia.
 */
export function ApplicantDetailModal({
  request,
  onOpenChange,
  onAdvance,
  movingId,
}: ApplicantDetailModalProps) {
  return (
    <Dialog open={request !== null} onOpenChange={onOpenChange}>
      <DialogContent data-testid="applicant-detail-modal">
        {request && (
          <>
            <DialogHeader>
              <DialogTitle>Solicitud para adoptar a {request.animalSnapshot.name}</DialogTitle>
              <DialogDescription>
                {SPECIES_LABELS[request.animalSnapshot.species]} · Recibida el{' '}
                {formatBogota(request.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={adoptionStatusVariant(request.status)}>
                  {ADOPTION_STATUS_LABELS[request.status]}
                </Badge>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Solicitante
                </h3>
                <p className="font-medium" data-testid="applicant-name">
                  {request.applicant.fullName}
                </p>
                <p className="text-muted-foreground" data-testid="applicant-email">
                  {request.applicant.email}
                </p>
                {request.applicant.phone && (
                  <p className="text-muted-foreground" data-testid="applicant-phone">
                    {request.applicant.phone}
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  ¿Por qué quiere adoptar a {request.animalSnapshot.name}?
                </h3>
                <p className="whitespace-pre-wrap" data-testid="applicant-message">
                  {request.message}
                </p>
              </div>
            </div>

            <DialogFooter>
              {ADOPTION_NEXT_STATUSES[request.status].map((target) => (
                <Button
                  key={target}
                  variant={target === 'rejected' ? 'outline' : 'default'}
                  disabled={movingId === request.id}
                  onClick={() => onAdvance(request, target)}
                >
                  {ADOPTION_STATUS_LABELS[target]}
                </Button>
              ))}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
