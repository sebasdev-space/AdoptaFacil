import { useCallback, useEffect, useState } from 'react';
import type { AdoptionContract } from '@adoptafacil/contracts';
import { Badge, Button, Skeleton, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import {
  generateAdoptionContract,
  getContractForRequest,
  signAdoptionContract,
  transitionAdoptionContract,
} from '../api/adoptions-api';
import { formatBogota } from '../model/adoptions-view';
import {
  CONTRACT_STATUS_LABELS,
  SIGNER_ROLE_LABELS,
  contractStatusVariant,
  shortHash,
  signatureProgress,
} from '../model/adoptions-contract-view';

export interface AdoptionContractPanelProps {
  requestId: string;
  /** Whether the current user may generate/manage the contract (org roles). */
  canManage: boolean;
}

/**
 * Contract + signature panel (§M04, T-028b, RF11) shown on an APPROVED request.
 * Org roles generate the contract and send it to signatures; each signer (org
 * representative or the adopter) signs their own part via the simulable
 * SignaturePort. When every party has signed, the contract is sealed (hash) and
 * shown immutable. Signature times are stored UTC and shown in hora Colombia.
 */
export function AdoptionContractPanel({ requestId, canManage }: AdoptionContractPanelProps) {
  const client = useApiClient();
  const { user } = useSession();
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

  const run = useCallback(
    async (fn: () => Promise<AdoptionContract>, ok: string) => {
      setBusy(true);
      try {
        setContract(await fn());
        toast({ title: ok });
      } catch {
        toast({ title: 'No se pudo completar la acción del contrato', variant: 'destructive' });
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  if (contract === undefined) return <Skeleton className="h-16 w-full" />;

  if (!contract) {
    return (
      <div className="rounded-md border border-dashed p-2 text-xs">
        <p className="mb-2 text-muted-foreground">Sin contrato de adopción.</p>
        {canManage && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(() => generateAdoptionContract(client, { requestId }), 'Contrato generado')
            }
          >
            Generar contrato
          </Button>
        )}
      </div>
    );
  }

  const { signed, total } = signatureProgress(contract);
  const mySigner = contract.signers.find((s) => s.userId === user?.id && !s.signedAt);
  const canSign = contract.status === 'pending_signatures' && Boolean(mySigner);

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

      <ul className="space-y-1">
        {contract.signers.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2">
            <span>{SIGNER_ROLE_LABELS[s.role]}</span>
            <span className="text-muted-foreground">
              {s.signedAt ? `✓ ${formatBogota(s.signedAt)}` : 'pendiente'}
            </span>
          </li>
        ))}
      </ul>

      {contract.status === 'signed' && (
        <p className="break-all text-muted-foreground" title={contract.contentHash}>
          Sellado · hash {shortHash(contract.contentHash)}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {canManage && contract.status === 'draft' && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  transitionAdoptionContract(client, contract.id, {
                    targetStatus: 'pending_signatures',
                  }),
                'Contrato enviado a firmas',
              )
            }
          >
            Enviar a firmas
          </Button>
        )}
        {canSign && mySigner && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                () => signAdoptionContract(client, contract.id, { signerId: mySigner.id }),
                'Firma registrada',
              )
            }
          >
            Firmar mi parte
          </Button>
        )}
      </div>
    </div>
  );
}
