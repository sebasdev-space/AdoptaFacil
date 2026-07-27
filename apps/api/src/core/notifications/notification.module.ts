import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { LogNotificationAdapter } from './log-notification.adapter';
import { SmtpNotificationAdapter } from './smtp-notification.adapter';
import { NOTIFICATION_PORT } from './notification.port';

/**
 * Shared NotificationPort provider (T-107) + real SMTP adapter (T-109). Global so
 * any module injects NOTIFICATION_PORT without re-binding it. The adapter is
 * chosen by NOTIFICATION_DRIVER: `smtp` (real email, prod) or `log` (stub, the
 * default and what tests use). Swapping to SendGrid/SES later = add an adapter
 * and one line in this factory — auth/reminders are untouched.
 */
@Global()
@Module({
  providers: [
    {
      provide: NOTIFICATION_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('NOTIFICATION_DRIVER', { infer: true }) === 'smtp'
          ? new SmtpNotificationAdapter(config)
          : new LogNotificationAdapter(),
    },
  ],
  exports: [NOTIFICATION_PORT],
})
export class NotificationModule {}
