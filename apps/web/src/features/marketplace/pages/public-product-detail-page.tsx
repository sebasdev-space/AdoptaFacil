import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { ProductPublic } from '@adoptafacil/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  buttonVariants,
  cn,
} from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { getPublicProduct } from '../api/public-marketplace';
import {
  CATEGORY_LABELS,
  buildWhatsappUrl,
  contactMessage,
  formatCop,
  stockLabel,
} from '../model/marketplace-view';

type DetailState = 'loading' | 'ready' | 'not-found' | 'error';

interface ProductNavState {
  product?: ProductPublic;
}

/**
 * Detalle PÚBLICO de un producto (M10, F-7) en `/marketplace/:id`. Sin
 * autenticación; columnas públicas de `ProductPublic`. Llega por nav-state
 * desde la tarjeta o se resuelve por `GET /public/marketplace/products/:id`
 * en deep-link (404 → no encontrado). El botón "Contactar por WhatsApp" abre
 * `wa.me` con un mensaje precargado — NO hay carrito ni checkout; la venta
 * ocurre fuera de la plataforma. El aviso de no garantía es SIEMPRE visible.
 */
export function PublicProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const preloaded = (location.state as ProductNavState | null)?.product;

  const [product, setProduct] = useState<ProductPublic | null>(preloaded ?? null);
  const [state, setState] = useState<DetailState>(preloaded ? 'ready' : 'loading');

  useEffect(() => {
    if (preloaded || !id) {
      if (!id) setState('not-found');
      return;
    }
    let active = true;
    getPublicProduct(id)
      .then((found) => {
        if (!active) return;
        setProduct(found);
        setState(found ? 'ready' : 'not-found');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [preloaded, id]);

  const whatsappUrl = product
    ? buildWhatsappUrl(
        product.organizationWhatsapp,
        contactMessage(product.name, product.organizationName),
      )
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <Link to="/marketplace" className="text-sm text-primary hover:underline">
          ← Volver al marketplace
        </Link>

        <div className="mt-4">
          {state === 'loading' && <Skeleton className="h-72 w-full" />}
          {state === 'not-found' && (
            <EmptyState
              title="Producto no encontrado"
              description="Este producto no existe, no está disponible o el enlace no es válido."
            />
          )}
          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}
          {state === 'ready' && product && (
            <Card data-testid="public-product-detail">
              <CardHeader className="gap-2">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {product.name}
                  <Badge variant="secondary">{CATEGORY_LABELS[product.category]}</Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{product.organizationName}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {product.images.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {product.images.map((image) => (
                      <img
                        key={image.id}
                        src={image.url}
                        alt={product.name}
                        className="aspect-square w-full rounded-md border object-cover"
                      />
                    ))}
                  </div>
                )}
                {product.description && (
                  <p className="text-sm text-foreground">{product.description}</p>
                )}
                <p className="text-2xl font-semibold">{formatCop(product.price)}</p>
                <p className="text-sm text-muted-foreground">{stockLabel(product.stock)}</p>

                {whatsappUrl ? (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants(), 'w-full sm:w-auto')}
                    data-testid="whatsapp-cta"
                  >
                    Contactar por WhatsApp
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Esta organización no tiene un WhatsApp de contacto configurado.
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  AdoptaFácil no garantiza la entrega ni la calidad de este producto. La compra se
                  acuerda directamente entre tú y la organización.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
