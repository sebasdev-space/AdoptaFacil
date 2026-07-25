import type { FollowUpMilestoneStatus } from '@adoptafacil/contracts';

/** Human labels (es-CO) per follow-up milestone status. */
export const FOLLOWUP_STATUS_LABELS: Record<FollowUpMilestoneStatus, string> = {
  scheduled: 'Programado',
  completed: 'Completado',
  overdue: 'Vencido',
};

/** Badge variant per milestone status (semantic). */
export function followUpStatusVariant(
  status: FollowUpMilestoneStatus,
): 'outline' | 'success' | 'destructive' {
  switch (status) {
    case 'scheduled':
      return 'outline';
    case 'completed':
      return 'success';
    case 'overdue':
      return 'destructive';
  }
}
