import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdoptionContract } from '@adoptafacil/contracts';
import { Badge, Button, Skeleton, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { generateAdoptionContract, getContractForRequest } from '../api/adoptions-api';
import {
  CONTRACT_STATUS_LABELS,
  contractStatusVariant,
  shortHash,
  signatureProgress,
} from '../model/adoptions-contract-view';
import { AdoptionFollowUpPanel } from './adoption-followup-panel';

export interface AdoptionContractPanelProps {
  requestId: string;
  /** Whether the current user may generate/manage the contract (org roles). */
  canManage: boolean;
}

/**
 * Contract summary (§M04, T-028b, RF11) shown on an APPROVED request —
 * generates the contract, or links to the dedicated
 * `/adopciones/contratos/:id` page (nuevo requerimiento: texto legal real,
 * diligenciar datos, firmar como representante/adoptante) for anything past
 * "draft, no signatures yet".
 */
export function AdoptionContractPanel({ requestId, canManage }: AdoptionContractPanelProps) {
  const client = useApiClient();
  const { toast } = useToast();

  const [contract, setContract] = useState<AdoptionContract | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!canManage) {
      setContract(null);
      return;
    }
    getContractForRequest(client, requestId)
      .then(setContract)
      .catch(() => setContract(null));
  }, [client, requestId, canManage]);

  useEffect(() => load(), [load]);

  const generate = useCallback(async () => {
    setBusy(true);
    try {
      setContract(await generateAdoptionContract(client, { requestId }));
      toast({ title: 'Contrato generado' });
    } catch {
      toast({ title: 'No se pudo generar el contrato', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [client, requestId, toast]);

  if (contract === undefined) return <Skeleton className="h-16 w-full" />;

  if (!contract) {
    return (
      <div className="rounded-md border border-dashed p-2 text-xs">
        <p className="mb-2 text-muted-foreground">Sin contrato de adopción.</p>
        {canManage && (
          <Button size="sm" disabled={busy} onClick={() => void generate()}>
            Generar contrato
          </Button>
        )}
      </div>
    );
  }

  const { signed, total } = signatureProgress(contract);

  return (
    <div className="space-y-2 rounded-md border p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Contrato (v{contract.version})</span>
        <Badge variant={contractStatusVariant(contract.status)}>
          {CONTRACT_STATUS_LABELS[contract.status]}
        </Badge>
      </div>

      <p className="text-muted-foreground">
        Firmas: {signed}/{total}
      </p>

      {contract.status === 'signed' && (
        <p className="break-all text-muted-foreground" title={contract.contentHash}>
          Sellado · hash {shortHash(contract.contentHash)}
        </p>
      )}

      <Link
        to={`/adopciones/contratos/${contract.id}`}
        className="inline-block font-medium text-primary underline-offset-4 hover:underline"
      >
        Ver contrato →
      </Link>

      {/* T-028c · seguimiento post-adopción (disponible una vez firmado). */}
      {contract.status === 'signed' && (
        <AdoptionFollowUpPanel contractId={contract.id} canManage={canManage} />
      )}
    </div>
  );
}
