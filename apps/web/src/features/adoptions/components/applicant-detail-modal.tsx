import type { AdoptionRequest, AdoptionStatus } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@adoptafacil/ui';
import { SPECIES_LABELS } from '../../portals/model/animals-catalog';
import {
  ADOPTION_NEXT_STATUSES,
  ADOPTION_STATUS_LABELS,
  adoptionStatusVariant,
  formatBogota,
} from '../model/adoptions-view';

export interface ApplicantDetailModalProps {
  /** `null` cierra el panel (patrón controlado, igual que el resto del proyecto). */
  request: AdoptionRequest | null;
  onOpenChange: (open: boolean) => void;
  onAdvance: (request: AdoptionRequest, targetStatus: AdoptionStatus) => void;
  /** Id de la solicitud con una transición en curso (deshabilita sus botones). */
  movingId: string | null;
}

/**
 * Panel de detalle del solicitante (F-MODAL-SOLICITANTE), paso previo a avanzar
 * una solicitud desde el kanban de evaluación (§M04). REFACTOR-VISUAL v2 Fase 7:
 * migrado de `Dialog` (modal centrado) a `Drawer` (panel deslizante desde la
 * derecha, como el mockup de referencia) — mismo `data-testid`/estructura/
 * comportamiento, solo cambia la posición/animación (mismos primitivos Radix
 * Dialog por debajo, ver `packages/ui/src/components/drawer.tsx`).
 *
 * Muestra ÚNICAMENTE datos REALES que `AdoptionRequest` ya expone — identidad y
 * contacto del solicitante (`applicant`), su mensaje de motivación completo (la
 * tarjeta lo trunca a 3 líneas), el animal solicitado (`animalSnapshot`) y el
 * estado/fecha. No hay preguntas separadas de "condiciones de vivienda" o
 * "experiencia" en el formulario real (`AdoptionRequestPage` solo pide nombre/
 * correo/teléfono/un mensaje) — mostrarlas sería inventar datos que el contrato
 * no trae, así que no se fabrican (el mockup de referencia sí las muestra, junto
 * con un puntaje de "compatibilidad IA" — ninguno de los dos existe hoy). Las
 * acciones de avanzar reutilizan EXACTAMENTE el mismo handler que ya usan los
 * botones de la tarjeta (`onAdvance` = `move` del kanban); esto es solo una
 * vista de detalle, la lógica de transición no cambia.
 */
export function ApplicantDetailModal({
  request,
  onOpenChange,
  onAdvance,
  movingId,
}: ApplicantDetailModalProps) {
  return (
    <Drawer open={request !== null} onOpenChange={onOpenChange}>
      <DrawerContent data-testid="applicant-detail-modal">
        {request && (
          <>
            <DrawerHeader>
              <DrawerTitle>Solicitud para adoptar a {request.animalSnapshot.name}</DrawerTitle>
              <DrawerDescription>
                {SPECIES_LABELS[request.animalSnapshot.species]} · Recibida el{' '}
                {formatBogota(request.createdAt)}
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="space-y-4 text-sm">
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
            </DrawerBody>

            <DrawerFooter>
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
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
