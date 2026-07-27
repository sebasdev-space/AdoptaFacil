import { Link } from 'react-router-dom';
import type { CampaignPublic } from '@adoptafacil/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@adoptafacil/ui';
import { CATEGORY_LABELS, formatBogota, publicCampaignDetailHref } from '../model/campaigns-view';
import { CampaignProgress } from './campaign-progress';

export interface CampaignCardProps {
  campaign: CampaignPublic;
}

/**
 * Tarjeta pública de una campaña activa (§M14/M06). Muestra sólo columnas públicas
 * (título, organización, categoría con label legible, avance —hoy 0—, deadline) y
 * enlaza al detalle público; pasa la campaña por nav-state para evitar refetch.
 */
export function CampaignCard({ campaign }: CampaignCardProps) {
  return (
    <Card data-testid="campaign-card">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">
          <Link
            to={publicCampaignDetailHref(campaign.id)}
            state={{ campaign }}
            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {campaign.title}
          </Link>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{CATEGORY_LABELS[campaign.category]}</Badge>
          <span className="text-xs text-muted-foreground">{campaign.organizationName}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <CampaignProgress
          raisedAmount={campaign.raisedAmount}
          goalAmount={campaign.goalAmount}
          progress={campaign.progress}
        />
        <p className="text-xs text-muted-foreground">Vence {formatBogota(campaign.deadline)}</p>
      </CardContent>
    </Card>
  );
}
