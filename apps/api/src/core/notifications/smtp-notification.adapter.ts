import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Env } from '../../config/env.validation';
import { NotificationMessage, NotificationPort } from './notification.port';

/** Minimal transport surface we depend on (so tests can inject a fake). */
export interface MailTransport {
  sendMail(options: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

/** Factory for the transport; defaults to nodemailer, overridable in tests. */
export type MailTransportFactory = (options: {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}) => MailTransport;

/**
 * Real SMTP NotificationPort (T-109). Credentials come EXCLUSIVELY from env
 * (SMTP_HOST/PORT/USER/PASS/FROM) — never hardcoded. Selected when
 * NOTIFICATION_DRIVER=smtp; the log stub stays the default. Sending is
 * BEST-EFFORT: any failure (bad creds, network, rate limit) is caught and
 * reported as a failure WITHOUT throwing, so it never tumbles the request/app
 * (coherent with T-106). NEVER logs the body or credentials (Ley 1581) — at most
 * recipient + result. Swapping to SendGrid/SES later = new adapter + one line in
 * NotificationModule; consumers (auth, reminders) are untouched.
 */
@Injectable()
export class SmtpNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger('NotificationPort');
  private readonly from: string;
  private readonly transport: MailTransport;

  constructor(
    config: ConfigService<Env, true>,
    createTransport: MailTransportFactory = nodemailer.createTransport,
  ) {
    // Non-null: env validation (fail-fast) guarantees these when driver=smtp.
    const host = config.get('SMTP_HOST', { infer: true }) as string;
    const port = config.get('SMTP_PORT', { infer: true }) as number;
    const user = config.get('SMTP_USER', { infer: true }) as string;
    const pass = config.get('SMTP_PASS', { infer: true }) as string;
    this.from = config.get('SMTP_FROM', { infer: true }) as string;
    this.transport = createTransport({
      host,
      port,
      secure: port === 465, // implicit TLS on 465; STARTTLS otherwise
      auth: { user, pass },
    });
  }

  async send(message: NotificationMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
      // Recipient + result only — never subject/body/credentials.
      this.logger.log(`email to=${message.to} result=ok`);
    } catch (error) {
      // Best-effort: report and continue; never throw, never log the body/creds.
      this.logger.warn(`email to=${message.to} result=failed (${(error as Error).message})`);
    }
  }
}
