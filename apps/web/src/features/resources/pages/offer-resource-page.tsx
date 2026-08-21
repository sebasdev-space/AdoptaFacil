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
              description="La organización revisará tu oferta y te llegará su decisión. Podrás verla en 'Mis ofertas'."
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
