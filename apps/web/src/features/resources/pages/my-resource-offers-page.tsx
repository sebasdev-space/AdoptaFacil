import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ResourceOfferWithNeed } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  buttonVariants,
  cn,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { EVIDENCE_ACCEPT, uploadOfferProof, validateProofFiles } from '../lib/storage';
import {
  DELIVERY_STATUS_LABELS,
  OFFER_STATUS_LABELS,
  PROOF_STATUS_LABELS,
  donorCanAttachProof,
  offerStatusVariant,
  proofStatusVariant,
} from '../model/resources-view';

/**
 * `/mis-ofertas` (M09, F-6) — las ofertas de donación física del usuario
 * autenticado, cross-tenant por identidad (`GET /resources/offers/mine`), sin
 * `@Roles` en el backend — cualquier autenticado, mismo criterio que "Mis
 * donaciones"/"Mis apadrinamientos".
 */
export function MyResourceOffersPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const [offers, setOffers] = useState<ResourceOfferWithNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await client.request<ResourceOfferWithNeed[]>('/resources/offers/mine');
        if (active) setOffers(Array.isArray(rows) ? rows : []);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, reloadKey]);

  const attachProof = async (offer: ResourceOfferWithNeed, files: File[]): Promise<void> => {
    const invalid = validateProofFiles(files, offer.proofCount ?? 0);
    if (invalid) {
      toast({ title: 'Archivo no válido', description: invalid, variant: 'warning' });
      return;
    }
    try {
      for (const file of files) {
        await uploadOfferProof(client, offer.id, file);
      }
      toast({ title: 'Prueba enviada a la organización', variant: 'success' });
      setReloadKey((n) => n + 1);
    } catch (err) {
      toast({
        title: 'No se pudo adjuntar la prueba',
        description: err instanceof Error ? err.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Mis ofertas"
        description="Ofertas de donación física que has enviado a las organizaciones."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && error && (
        <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
      )}
      {!loading && !error && offers.length === 0 && (
        <EmptyState
          title="Aún no has ofrecido ninguna donación"
          description="Explora el banco de recursos y ofrece ayuda a una necesidad."
          action={
            <Link to="/recursos" className={cn(buttonVariants())}>
              Ver necesidades
            </Link>
          }
        />
      )}
      {!loading && !error && offers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {offers.map((offer) => (
            <Card key={offer.id} data-testid="my-offer-card">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">{offer.needTitle}</CardTitle>
                <p className="text-xs text-muted-foreground">{offer.organizationName}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  {offer.quantityOffered} {offer.needUnit}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={offerStatusVariant(offer.status)}>
                    {OFFER_STATUS_LABELS[offer.status]}
                  </Badge>
                  {offer.deliveryStatus && (
                    <Badge variant="secondary">
                      {DELIVERY_STATUS_LABELS[offer.deliveryStatus]}
                    </Badge>
                  )}
                </div>
                {offer.proofStatus && (
                  <div className="space-y-1" data-testid="my-offer-proof">
                    <Badge variant={proofStatusVariant(offer.proofStatus)}>
                      {PROOF_STATUS_LABELS[offer.proofStatus]}
                    </Badge>
                    {offer.proofValidationReason && (
                      <p className="text-xs text-muted-foreground">
                        Motivo: {offer.proofValidationReason}
                      </p>
                    )}
                  </div>
                )}
                {donorCanAttachProof(offer.status, offer.proofStatus, offer.proofCount ?? 0) && (
                  <ProofPicker
                    offerId={offer.id}
                    label={offer.proofStatus ? 'Adjuntar otra prueba' : 'Adjuntar prueba'}
                    onSubmit={(files) => attachProof(offer, files)}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

/** Selector de archivos de prueba (foto/factura) + botón de envío. */
function ProofPicker({
  offerId,
  label,
  onSubmit,
}: {
  offerId: string;
  label: string;
  onSubmit: (files: File[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="file"
        multiple
        aria-label={`Archivos de prueba de la oferta ${offerId}`}
        accept={EVIDENCE_ACCEPT.join(',')}
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="text-xs text-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={files.length === 0}
        onClick={() => {
          onSubmit(files);
          setFiles([]);
        }}
      >
        {label}
      </Button>
    </div>
  );
}
