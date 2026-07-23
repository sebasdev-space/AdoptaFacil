import { Global, Module } from '@nestjs/common';
import { LogNotificationAdapter } from './log-notification.adapter';
import { NOTIFICATION_PORT } from './notification.port';

/**
 * Shared NotificationPort provider (T-107). Global so any module injects
 * NOTIFICATION_PORT without re-binding it. Bound to the log stub in Ola 1; swap
 * the class here (one place) for a real adapter in production.
 */
@Global()
@Module({
  providers: [{ provide: NOTIFICATION_PORT, useClass: LogNotificationAdapter }],
  exports: [NOTIFICATION_PORT],
})
export class NotificationModule {}
