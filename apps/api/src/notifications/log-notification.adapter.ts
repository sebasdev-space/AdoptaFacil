import { Injectable, Logger } from '@nestjs/common';
import { NotificationMessage, NotificationPort } from './notification.port';

/**
 * Simulable adapter: writes notifications to the log instead of contacting a
 * real provider. Selected when NOTIFICATION_DRIVER=log (the only driver in
 * Sprint 0). Demonstrates the ports/adapters seam without external integrations.
 */
@Injectable()
export class LogNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('NotificationPort');

  async send(message: NotificationMessage): Promise<void> {
    this.logger.log(`[SIMULATED] to=${message.to} subject="${message.subject}"`);
  }
}
