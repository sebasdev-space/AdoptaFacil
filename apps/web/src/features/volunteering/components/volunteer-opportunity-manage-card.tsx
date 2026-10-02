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
  const isActive = opportunity.status === 'active';

  return (
    <Card
      data-testid="volunteer-opportunity-manage-card"
      className={cn(
        'group relative flex flex-col overflow-hidden border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        isActive ? 'border-success/30 bg-success/5' : '',
      )}
    >
      {/* Accent strip */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-1 rounded-t-[inherit]',
          isActive ? 'bg-success' : 'bg-muted',
        )}
      />

      <CardHeader className="gap-2 pt-5">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{opportunity.title}</CardTitle>
          <Badge variant={opportunityStatusVariant(opportunity.status)} className="shrink-0">
            {OPPORTUNITY_STATUS_LABELS[opportunity.status]}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{opportunity.category}</Badge>
          {opportunity.appliesToStudentService && <Badge variant="info">🎓 Serv. social</Badge>}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <span aria-hidden>📅</span>
            {formatBogota(opportunity.startDate)} – {formatBogota(opportunity.endDate)}
          </p>
          <p className="flex items-center gap-1.5">
            <span aria-hidden>📍</span>
            <span className="truncate">{opportunity.location}</span>
          </p>
          {opportunity.capacity != null && (
            <p className="flex items-center gap-1.5">
              <span aria-hidden>👥</span>Cupo: {opportunity.capacity} personas
            </p>
          )}
        </div>

        <Link
          to={`/organizacion/voluntariado/${encodeURIComponent(opportunity.id)}`}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'mt-auto w-full transition-colors group-hover:border-primary group-hover:text-primary',
          )}
        >
          Gestionar →
        </Link>
      </CardContent>
    </Card>
  );
}
