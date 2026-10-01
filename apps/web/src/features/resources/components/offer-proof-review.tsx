import { useEffect, useState } from 'react';
import {
  type ResourceOffer,
  type ResourceOfferProof,
  ResourceOfferProofStatus,
  type ValidateResourceOfferProofInput,
} from '@adoptafacil/contracts';
import { Badge, Button, Input, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { openOfferProofFile } from '../lib/storage';
import { PROOF_STATUS_LABELS, formatBogota, proofStatusVariant } from '../model/resources-view';

interface OfferProofReviewProps {
  offer: ResourceOffer;
  /** Owner/Administrator/Operator (los demás roles solo ven). */
  canManage: boolean;
  /** Se llama tras validar para refrescar la lista de ofertas. */
  onValidated: () => void | Promise<void>;
}

/**
 * M09 — revisión de la PRUEBA (foto/factura) que el donante adjuntó al
 * ofrecer. Validación EXPLÍCITA (aprobar / rechazar con motivo), separada de
 * aceptar la oferta y de completar la entrega. Los archivos son privados: se
 * abren descargándolos con el JWT.
 */
export function OfferProofReview({ offer, canManage, onValidated }: OfferProofReviewProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const [proofs, setProofs] = useState<ResourceOfferProof[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const proofCount = offer.proofCount ?? 0;

  useEffect(() => {
    if (proofCount === 0) return;
    let active = true;
    void (async () => {
      try {
        const rows = await client.request<ResourceOfferProof[]>(
          `/resources/offers/${encodeURIComponent(offer.id)}/proofs`,
        );
        if (active) setProofs(Array.isArray(rows) ? rows : []);
      } catch {
        if (active) setProofs([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, offer.id, proofCount]);

  if (!offer.proofStatus) return null;

  const open = async (proofId: string): Promise<void> => {
    try {
      await openOfferProofFile(client, offer.id, proofId);
    } catch (error) {
      toast({
        title: 'No se pudo abrir la prueba',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const validate = async (decision: ValidateResourceOfferProofInput['decision']): Promise<void> => {
    if (decision === 'reject' && !reason.trim()) {
      toast({
        title: 'Falta el motivo',
        description: 'Indica por qué rechazas la prueba para que el donante pueda corregirla.',
        variant: 'warning',
      });
      return;
    }
    setBusy(true);
    try {
      const body: ValidateResourceOfferProofInput = {
        decision,
        ...(decision === 'reject' ? { reason: reason.trim() } : {}),
      };
      await client.request(`/resources/offers/${encodeURIComponent(offer.id)}/proof-validation`, {
        method: 'PATCH',
        json: body,
      });
      setReason('');
      toast({
        title: decision === 'approve' ? 'Prueba aprobada' : 'Prueba rechazada',
        variant: 'success',
      });
      await onValidated();
    } catch (error) {
      toast({
        title: 'No se pudo validar la prueba',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const pending = offer.proofStatus === ResourceOfferProofStatus.Pending;

  return (
    <div className="mt-3 w-full space-y-2 border-t pt-3" data-testid="offer-proof-review">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">Prueba del donante</span>
        <Badge variant={proofStatusVariant(offer.proofStatus)}>
          {PROOF_STATUS_LABELS[offer.proofStatus]}
        </Badge>
        {offer.proofValidatedAt && (
          <span className="text-xs text-muted-foreground">
            {formatBogota(offer.proofValidatedAt)}
          </span>
        )}
      </div>
      {offer.proofValidationReason && (
        <p className="text-xs text-muted-foreground">Motivo: {offer.proofValidationReason}</p>
      )}
      <ul className="space-y-1" data-testid="offer-proof-files">
        {proofs.map((proof) => (
          <li key={proof.id} className="text-xs">
            <button
              type="button"
              className="truncate text-primary hover:underline"
              onClick={() => void open(proof.id)}
            >
              {proof.filename}
            </button>
          </li>
        ))}
      </ul>
      {canManage && pending && (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            aria-label="Motivo del rechazo de la prueba"
            placeholder="Motivo (obligatorio para rechazar)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="max-w-xs"
          />
          <Button size="sm" disabled={busy} onClick={() => void validate('approve')}>
            Aprobar prueba
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void validate('reject')}
          >
            Rechazar prueba
          </Button>
        </div>
      )}
    </div>
  );
}
