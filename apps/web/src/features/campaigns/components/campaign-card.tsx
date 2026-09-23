import { Link } from 'react-router-dom';
import type { CampaignPublic } from '@adoptafacil/contracts';
import { Badge } from '@adoptafacil/ui';
import { CATEGORY_LABELS, formatBogota, publicCampaignDetailHref } from '../model/campaigns-view';
import { CampaignProgress } from './campaign-progress';
import styles from './campaign-card.module.scss';

export interface CampaignCardProps {
  campaign: CampaignPublic;
}

/**
 * Tarjeta pública de una campaña activa (§M14/M06, rediseño "editorial"
 * T-D06). Muestra sólo columnas públicas (título, organización, categoría
 * con label legible, avance —hoy 0—, deadline) y enlaza al detalle público;
 * pasa la campaña por nav-state para evitar refetch. Simple a propósito
 * (feedback directo: sin cabecera decorativa "de dashboard").
 */
export function CampaignCard({ campaign }: CampaignCardProps) {
  const href = publicCampaignDetailHref(campaign.id);
  return (
    <article className={styles.card} data-testid="campaign-card">
      <div className={styles.meta}>
        <Badge variant="secondary">{CATEGORY_LABELS[campaign.category]}</Badge>
        <span className="text-xs text-muted-foreground">{campaign.organizationName}</span>
      </div>
      <Link
        to={href}
        state={{ campaign }}
        className={`${styles.title} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        {campaign.title}
      </Link>
      <CampaignProgress
        raisedAmount={campaign.raisedAmount}
        goalAmount={campaign.goalAmount}
        progress={campaign.progress}
      />
      <p className={styles.deadline}>Vence {formatBogota(campaign.deadline)}</p>
      <Link to={href} state={{ campaign }} className={styles.cta}>
        Quiero ayudar
      </Link>
    </article>
  );
}
