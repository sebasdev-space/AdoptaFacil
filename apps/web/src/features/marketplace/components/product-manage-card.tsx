import { Link } from 'react-router-dom';
import type { Product } from '@adoptafacil/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  buttonVariants,
  cn,
} from '@adoptafacil/ui';
import {
  CATEGORY_LABELS,
  formatCop,
  manageProductHref,
  stockLabel,
} from '../model/marketplace-view';

export interface ProductManageCardProps {
  product: Product;
}

/**
 * Tarjeta de GESTIÓN interna de un producto (M10, `/organizacion/marketplace`).
 * A diferencia de `ProductCard` (pública, `ProductPublic`), muestra el estado
 * real (incl. inactivo) y enlaza al detalle interno para editar/gestionar
 * fotos, nunca al catálogo público.
 */
export function ProductManageCard({ product }: ProductManageCardProps) {
  return (
    <Card data-testid="product-manage-card">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">{product.name}</CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{CATEGORY_LABELS[product.category]}</Badge>
          <Badge variant={product.isActive ? 'success' : 'destructive'}>
            {product.isActive ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-lg font-semibold">{formatCop(product.price)}</p>
        <p className="text-xs text-muted-foreground">{stockLabel(product.stock)}</p>
        <Link
          to={manageProductHref(product.id)}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
        >
          Ver detalle
        </Link>
      </CardContent>
    </Card>
  );
}
