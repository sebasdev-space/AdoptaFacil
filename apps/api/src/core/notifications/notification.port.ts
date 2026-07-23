/**
 * NotificationPort (hexagonal) — the SINGLE shared definition for outbound
 * notifications (emails/SMS/push). Promoted to core in T-107 (it was already the
 * single global port, previously under src/notifications).
 *
 * Ola 1 ships only the PORT and a simulable stub (see LogNotificationAdapter);
 * real adapters arrive later behind this same interface, bound to
 * NOTIFICATION_PORT in one place. Consumers (auth password-reset, clinical
 * reminders, future dispersions/emails) depend on this abstraction only.
 */
export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');

export interface NotificationMessage {
  to: string;
  subject: string;
  body: string;
}

export interface NotificationPort {
  send(message: NotificationMessage): Promise<void>;
}
