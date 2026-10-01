import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { ResourceOffer } from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  buttonVariants,
  cn,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { TextAreaField } from '../components/resource-form-fields';
import { EVIDENCE_ACCEPT, uploadOfferProof, validateProofFiles } from '../lib/storage';

interface OfferTarget {
  needId: string;
  needTitle: string;
  unit: string;
  organizationName: string;
}

/**
 * Resolve the target need from navigation state or query params — same SEAM
 * as `DonatePage`'s `useDonationTarget`: it comes from the public need detail
 * page's "Quiero ayudar" CTA (`?needId=...&needTitle=...&unit=...&organizationName=...`).
 */
function useOfferTarget(): OfferTarget | null {
  const location = useLocation();
  const [params] = useSearchParams();
  return useMemo(() => {
    const state = (location.state as { target?: OfferTarget } | null)?.target;
    if (state?.needId && state.needTitle) return state;

    const needId = params.get('needId');
    const needTitle = params.get('needTitle');
    const unit = params.get('unit');
    const organizationName = params.get('organizationName');
    if (needId && needTitle && unit && organizationName) {
      return { needId, needTitle, unit, organizationName };
    }
    return null;
  }, [location.state, params]);
}

/**
 * `/ofrecer` (M09, F-6) — un usuario autenticado (Persona u organización)
 * ofrece cubrir una necesidad publicada por OTRA organización. Mismo SEAM que
 * `DonatePage`: el gate de sesión es el `<RequireAuth>` de la ruta padre; sin
 * necesidad objetivo, muestra el punto de integración (llegar desde
 * `/recursos/:id`).
 */
export function OfferResourcePage() {
  const client = useApiClient();
  const { toast } = useToast();
  const target = useOfferTarget();

  const [quantityOffered, setQuantityOffered] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [proofsFailed, setProofsFailed] = useState(0);
  const [done, setDone] = useState<ResourceOffer | null>(null);

  if (!target) {
    return (
      <PageContainer>
        <PageHeader
          title="Ofrecer ayuda"
          description="Para ofrecer una donación física, entra al banco de recursos y elige una necesidad."
        />
        <EmptyState
          title="Ninguna necesidad seleccionada"
          description="Ve al banco de recursos público y elige 'Quiero ayudar con esto' en una necesidad."
          action={
            <Link to="/recursos" className={cn(buttonVariants())}>
              Ver necesidades
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const submit = async (): Promise<void> => {
    const quantity = Number(quantityOffered);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast({
        title: 'Cantidad inválida',
        description: 'Indica cuánto quieres ofrecer (un entero mayor a 0).',
        variant: 'warning',
      });
      return;
    }
    const invalidProof = validateProofFiles(proofFiles);
    if (invalidProof) {
      toast({ title: 'Archivo no válido', description: invalidProof, variant: 'warning' });
      return;
    }
    setSubmitting(true);
    try {
      const offer = await client.request<ResourceOffer>('/resources/offers', {
        method: 'POST',
        json: {
          needId: target.needId,
          quantityOffered: quantity,
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      });
      // La prueba (foto/factura) se adjunta DESPUÉS de crear la oferta; si algún
      // archivo falla, la oferta ya existe y se puede reintentar desde "Mis ofertas".
      let failed = 0;
      for (const file of proofFiles) {
        try {
          await uploadOfferProof(client, offer.id, file);
        } catch {
          failed += 1;
        }
      }
      setProofsFailed(failed);
      setDone(offer);
      toast({ title: 'Oferta enviada', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo enviar la oferta',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Ofrecer ayuda"
        description={`Tu aporte para ${target.organizationName}.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>{target.needTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <EmptyState
              title="¡Gracias por tu ofrecimiento!"
              description={
                proofsFailed > 0
                  ? `Tu oferta se envió, pero ${proofsFailed} archivo(s) de prueba no se pudieron subir. Puedes volver a adjuntarlos desde 'Mis ofertas'.`
                  : "La organización revisará tu oferta (y tu prueba, si adjuntaste una) y te llegará su decisión. Podrás verla en 'Mis ofertas'."
              }
              action={
                <Link to="/mis-ofertas" className={cn(buttonVariants())}>
                  Ver mis ofertas
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="offer-quantity"
                  className="block text-sm font-medium text-foreground"
                >
                  Cantidad ({target.unit})
                </label>
                <Input
                  id="offer-quantity"
                  type="number"
                  min={1}
                  step={1}
                  placeholder={`Cantidad en ${target.unit}`}
                  value={quantityOffered}
                  onChange={(e) => setQuantityOffered(e.target.value)}
                />
              </div>
              <TextAreaField
                id="offer-message"
                label="Mensaje (opcional)"
                value={message}
                onChange={setMessage}
                placeholder="Cuéntale a la organización cómo/cuándo puedes entregarlo…"
              />
              <div className="space-y-1.5">
                <label htmlFor="offer-proof" className="block text-sm font-medium text-foreground">
                  Prueba: foto o factura (opcional)
                </label>
                <input
                  id="offer-proof"
                  type="file"
                  multiple
                  accept={EVIDENCE_ACCEPT.join(',')}
                  onChange={(e) => setProofFiles(Array.from(e.target.files ?? []))}
                  className="block text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  La organización revisará tu prueba y la aprobará o rechazará. Imágenes o PDF,
                  hasta 5 archivos.
                </p>
              </div>
              <Button disabled={submitting} onClick={() => void submit()}>
                {submitting ? 'Enviando…' : 'Enviar oferta'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
