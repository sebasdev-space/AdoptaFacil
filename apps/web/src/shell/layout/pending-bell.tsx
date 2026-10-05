import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ReminderStatus,
  Role,
  type ClinicalReminder,
  type OrganizationDashboardSummary,
} from '@adoptafacil/contracts';
import { Badge, cn } from '@adoptafacil/ui';
import { useApiClient } from '../api';
import { useSession } from '../auth';
import { fetchOrgSummary } from '../../features/_layout/api/dashboard-api';
import { deriveActionItems } from '../../features/_layout/model/action-items';
import { BellIcon } from '../icons';
import styles from './pending-bell.module.scss';

/** Mismos roles que `GET /clinical-reminders` (ANIMAL_VIEW_ROLES, nav-items.ts). */
const REMINDER_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.ReadOnlyAuditor,
] as const;
/** Mismos roles que `GET /org/summary` (OrganizationSummaryController.VIEW_ROLES). */
const SUMMARY_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

const POLL_MS = 5 * 60 * 1000;
const MAX_LISTED = 5;

const REMINDER_TYPE_LABELS: Record<string, string> = {
  vaccine: 'Vacuna',
  treatment: 'Tratamiento',
  surgery: 'Cirugía',
  sterilization: 'Esterilización',
  allergy: 'Alergia',
  disability: 'Incapacidad',
  medication: 'Medicamento',
  diagnosis: 'Diagnóstico',
};

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const isOpen = (reminder: ClinicalReminder): boolean =>
  reminder.status !== ReminderStatus.Acknowledged && reminder.status !== ReminderStatus.Dismissed;

/**
 * Campana de pendientes del encabezado (Inicio): muestra cuántos recordatorios
 * clínicos abiertos y acciones por revisar (solicitudes de adopción, documentos
 * por vencer/rechazados) tiene la organización, y al hacer clic los lista con
 * enlace a su pantalla. Reemplaza la entrada "Recordatorios" del menú lateral.
 *
 * Solo consulta lo que el rol puede ver (mismos roles que el backend): un rol sin
 * acceso a ninguno de los dos no ve la campana ni dispara consultas. Fallos de
 * red son silenciosos (sin contador), nunca rompen el encabezado.
 */
export function PendingBell() {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  const canSeeReminders = hasAnyRole(...REMINDER_ROLES);
  const canSeeSummary = hasAnyRole(...SUMMARY_ROLES);

  const [reminders, setReminders] = useState<ClinicalReminder[]>([]);
  const [summary, setSummary] = useState<OrganizationDashboardSummary | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const tasks: Promise<void>[] = [];
    if (canSeeReminders) {
      tasks.push(
        client
          .request<ClinicalReminder[]>('/clinical-reminders')
          .then((list) => setReminders(Array.isArray(list) ? list : []))
          .catch(() => undefined),
      );
    }
    if (canSeeSummary) {
      tasks.push(
        fetchOrgSummary(client)
          .then((data) => setSummary(data))
          .catch(() => undefined),
      );
    }
    await Promise.all(tasks);
  }, [client, canSeeReminders, canSeeSummary]);

  useEffect(() => {
    if (!canSeeReminders && !canSeeSummary) return;
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, canSeeReminders, canSeeSummary]);

  // Cierra con Escape o al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  if (!canSeeReminders && !canSeeSummary) return null;

  const openReminders = reminders.filter(isOpen).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const actions = summary ? deriveActionItems(summary) : [];
  const total = openReminders.length + actions.length;
  const badge = total > 9 ? '9+' : String(total);

  const toggle = () => {
    setOpen((value) => {
      if (!value) void load(); // al abrir, refresca
      return !value;
    });
  };

  return (
    <div className={styles.bell} ref={rootRef}>
      <button
        type="button"
        className={styles.bell__button}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={total > 0 ? `Pendientes: ${total} por revisar` : 'Pendientes: nada por revisar'}
        data-testid="pending-bell"
      >
        <BellIcon className="h-5 w-5" />
        {total > 0 && (
          <span className={styles.bell__badge} data-testid="pending-bell-count">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Recordatorios y acciones pendientes"
          className={styles.bell__panel}
          data-testid="pending-bell-panel"
        >
          <p className={styles.bell__title}>Pendientes</p>

          {total === 0 && (
            <p className={styles.bell__empty}>Todo al día. No hay nada por revisar.</p>
          )}

          {actions.length > 0 && (
            <section aria-label="Acciones por revisar">
              <p className={styles.bell__section}>Acciones por revisar</p>
              <ul className={styles.bell__list}>
                {actions.map((item) => (
                  <li key={item.key} className={styles.bell__item}>
                    <span>{item.label}</span>
                    <Link
                      to={item.href}
                      onClick={() => setOpen(false)}
                      className={styles.bell__link}
                    >
                      {item.linkLabel} →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {openReminders.length > 0 && (
            <section aria-label="Recordatorios clínicos">
              <p className={styles.bell__section}>Recordatorios</p>
              <ul className={styles.bell__list}>
                {openReminders.slice(0, MAX_LISTED).map((reminder) => (
                  <li key={reminder.id} className={styles.bell__item}>
                    <span className={styles.bell__row}>
                      <span className={styles.bell__itemTitle}>
                        {REMINDER_TYPE_LABELS[reminder.type] ?? reminder.type}
                      </span>
                      {reminder.status === ReminderStatus.Failed && (
                        <Badge variant="destructive">Fallo de envío</Badge>
                      )}
                    </span>
                    <span className={cn(styles.bell__meta)}>
                      Vence: {formatDue(reminder.dueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {canSeeReminders && (
            <Link
              to="/recordatorios"
              onClick={() => setOpen(false)}
              className={styles.bell__all}
              data-testid="pending-bell-all"
            >
              Ver todos los recordatorios
              {openReminders.length > MAX_LISTED ? ` (${openReminders.length})` : ''} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
