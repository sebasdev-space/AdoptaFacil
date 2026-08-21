import { Link } from 'react-router-dom';
import type { ResourceNeedPublic } from '@adoptafacil/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';
import { CATEGORY_LABELS, publicResourceNeedHref } from '../model/resources-view';
import { NeedProgress } from './need-progress';

export interface NeedCardProps {
  need: ResourceNeedPublic;
}

/**
 * Tarjeta pública de una necesidad (M09) que aún acepta ayuda. Muestra solo
 * columnas públicas y enlaza al detalle público; pasa la necesidad por
 * nav-state para evitar refetch (mismo patrón que `CampaignCard`).
 */
export function NeedCard({ need }: NeedCardProps) {
  return (
    <Card data-testid="need-card">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">
          <Link
            to={publicResourceNeedHref(need.id)}
            state={{ need }}
            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {need.title}
          </Link>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{CATEGORY_LABELS[need.category]}</Badge>
          <span className="text-xs text-muted-foreground">{need.organizationName}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <NeedProgress
          quantityFulfilled={need.quantityFulfilled}
          quantityNeeded={need.quantityNeeded}
          unit={need.unit}
          progress={need.progress}
        />
      </CardContent>
    </Card>
  );
}
