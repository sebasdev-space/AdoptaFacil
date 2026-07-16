import { Global, Module } from '@nestjs/common';
import { LogNotificationAdapter } from './log-notification.adapter';
import { NOTIFICATION_PORT } from './notification.port';

@Global()
@Module({
  providers: [
    {
      provide: NOTIFICATION_PORT,
      useClass: LogNotificationAdapter,
    },
  ],
  exports: [NOTIFICATION_PORT],
})
export class NotificationModule {}
