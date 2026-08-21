import { Link } from 'react-router-dom';
import type { ResourceNeed } from '@adoptafacil/contracts';
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
  NEED_STATUS_LABELS,
  manageResourceNeedHref,
  needStatusVariant,
} from '../model/resources-view';
import { NeedProgress } from './need-progress';

export interface NeedManageCardProps {
  need: ResourceNeed;
}

/**
 * Tarjeta de GESTIÓN interna de una necesidad (`/organizacion/recursos`). A
 * diferencia de `NeedCard` (pública), muestra el estado real (incl.
 * cancelada) y enlaza al detalle interno para editar y decidir ofertas.
 */
export function NeedManageCard({ need }: NeedManageCardProps) {
  return (
    <Card data-testid="need-manage-card">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">{need.title}</CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{CATEGORY_LABELS[need.category]}</Badge>
          <Badge variant={needStatusVariant(need.status)}>{NEED_STATUS_LABELS[need.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <NeedProgress
          quantityFulfilled={need.quantityFulfilled}
          quantityNeeded={need.quantityNeeded}
          unit={need.unit}
          progress={need.progress}
        />
        <Link
          to={manageResourceNeedHref(need.id)}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
        >
          Ver detalle
        </Link>
      </CardContent>
    </Card>
  );
}
