import { Link } from 'react-router-dom';
import type { Campaign } from '@adoptafacil/contracts';
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
  STATUS_LABELS,
  campaignStatusVariant,
  formatBogota,
} from '../model/campaigns-view';
import { CampaignProgress } from './campaign-progress';

export interface CampaignManageCardProps {
  campaign: Campaign;
}

/**
 * Tarjeta de GESTIÓN interna de una campaña (S2-01, `/organizacion/campanas`).
 * A diferencia de `CampaignCard` (pública, `CampaignPublic`), muestra el estado
 * real (incl. cancelada) y enlaza al detalle interno para editar/gestionar
 * evidencias, nunca al portal público.
 */
export function CampaignManageCard({ campaign }: CampaignManageCardProps) {
  return (
    <Card data-testid="campaign-manage-card">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">{campaign.title}</CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{CATEGORY_LABELS[campaign.category]}</Badge>
          <Badge variant={campaignStatusVariant(campaign.status)}>
            {STATUS_LABELS[campaign.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <CampaignProgress
          raisedAmount={campaign.raisedAmount}
          goalAmount={campaign.goalAmount}
          progress={campaign.progress}
        />
        <p className="text-xs text-muted-foreground">Vence {formatBogota(campaign.deadline)}</p>
        <Link
          to={`/organizacion/campanas/${encodeURIComponent(campaign.id)}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
        >
          Ver detalle
        </Link>
      </CardContent>
    </Card>
  );
}
