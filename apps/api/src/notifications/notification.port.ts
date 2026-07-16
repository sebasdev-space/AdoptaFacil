/**
 * Integration port (hexagonal architecture).
 *
 * Sprint 0 only defines the PORT and a simulable adapter — no real provider is
 * wired. Real adapters (email/SMS/push) arrive in later waves behind this same
 * interface. NOTE: the real PaymentPort is Fabián's (Ola 2) and is intentionally
 * NOT created here.
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
