import { Link } from 'react-router-dom';
import type { ProductPublic } from '@adoptafacil/contracts';
import { Badge, Card, CardContent, CardFooter, CardHeader, CardTitle } from '@adoptafacil/ui';
import {
  CATEGORY_LABELS,
  formatCop,
  publicProductHref,
  stockLabel,
} from '../model/marketplace-view';

export interface ProductCardProps {
  product: ProductPublic;
}

/**
 * Tarjeta PÚBLICA de un producto (M10, `/marketplace`). Incluye SIEMPRE el
 * aviso de no garantía de entrega/calidad — la plataforma no es parte de la
 * venta, que ocurre fuera de ella (contacto por WhatsApp en el detalle).
 */
export function ProductCard({ product }: ProductCardProps) {
  return (
    <Card data-testid="product-card">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">{product.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{product.organizationName}</p>
        <Badge variant="secondary">{CATEGORY_LABELS[product.category]}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-lg font-semibold">{formatCop(product.price)}</p>
        <p className="text-xs text-muted-foreground">{stockLabel(product.stock)}</p>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2">
        <Link
          to={publicProductHref(product.id)}
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver detalle →
        </Link>
        <p className="text-[11px] text-muted-foreground">
          AdoptaFácil no garantiza la entrega ni la calidad de este producto.
        </p>
      </CardFooter>
    </Card>
  );
}
