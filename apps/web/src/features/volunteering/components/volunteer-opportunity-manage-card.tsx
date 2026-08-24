import { Link } from 'react-router-dom';
import type { VolunteerOpportunity } from '@adoptafacil/contracts';
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
  OPPORTUNITY_STATUS_LABELS,
  formatBogota,
  opportunityStatusVariant,
} from '../model/volunteering-view';

export interface VolunteerOpportunityManageCardProps {
  opportunity: VolunteerOpportunity;
}

/** Tarjeta de gestión interna de una oportunidad de voluntariado (RF18,
 *  `/organizacion/voluntariado`). Enlaza al detalle interno para
 *  gestionar inscripciones/horas/certificados. */
export function VolunteerOpportunityManageCard({
  opportunity,
}: VolunteerOpportunityManageCardProps) {
  return (
    <Card data-testid="volunteer-opportunity-manage-card">
      <CardHeader className="gap-2">
        <CardTitle className="text-base">{opportunity.title}</CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{opportunity.category}</Badge>
          <Badge variant={opportunityStatusVariant(opportunity.status)}>
            {OPPORTUNITY_STATUS_LABELS[opportunity.status]}
          </Badge>
          {opportunity.appliesToStudentService && (
            <Badge variant="info">Servicio social estudiantil</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {formatBogota(opportunity.startDate)} – {formatBogota(opportunity.endDate)}
        </p>
        <p className="text-xs text-muted-foreground">{opportunity.location}</p>
        <Link
          to={`/organizacion/voluntariado/${encodeURIComponent(opportunity.id)}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
        >
          Ver detalle
        </Link>
      </CardContent>
    </Card>
  );
}
