import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import {
  type MailTransport,
  type MailTransportFactory,
  SmtpNotificationAdapter,
} from './smtp-notification.adapter';

const ENV: Record<string, unknown> = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: 465,
  SMTP_USER: 'mailer@example.test',
  SMTP_PASS: 'app-password',
  SMTP_FROM: 'AdoptaFácil <no-reply@example.test>',
};

function makeConfig(): ConfigService<Env, true> {
  return { get: (key: string) => ENV[key] } as unknown as ConfigService<Env, true>;
}

describe('SmtpNotificationAdapter (T-109)', () => {
  it('builds the transport from env (host/port/secure/auth) — no hardcoded creds', () => {
    const createTransport = jest.fn(
      () => ({ sendMail: jest.fn().mockResolvedValue({}) }) as MailTransport,
    ) as unknown as MailTransportFactory;
    new SmtpNotificationAdapter(makeConfig(), createTransport);
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      auth: { user: 'mailer@example.test', pass: 'app-password' },
    });
  });

  it('sends via the transport with the message fields', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const createTransport = (() => ({ sendMail }) as MailTransport) as MailTransportFactory;
    const adapter = new SmtpNotificationAdapter(makeConfig(), createTransport);

    await adapter.send({ to: 'user@dest.test', subject: 'Hola', body: 'contenido' });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'AdoptaFácil <no-reply@example.test>',
      to: 'user@dest.test',
      subject: 'Hola',
      text: 'contenido',
    });
  });

  it('is best-effort: a send failure does NOT throw (never tumbles the caller)', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP connection refused'));
    const createTransport = (() => ({ sendMail }) as MailTransport) as MailTransportFactory;
    const adapter = new SmtpNotificationAdapter(makeConfig(), createTransport);

    await expect(
      adapter.send({ to: 'user@dest.test', subject: 'Hola', body: 'x' }),
    ).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
