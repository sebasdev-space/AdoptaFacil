import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MERCADOPAGO_TOKEN_REFRESH_QUEUE } from './mercadopago-connect.constants';
import { MercadoPagoConnectService } from './mercadopago-connect.service';

/** Worker for the `mercadopago-token-refresh` queue (T-OAuth-Connect) — same
 *  `@Processor`/`WorkerHost` shape as `RemindersProcessor`/
 *  `SponsorshipBillingProcessor`. */
@Processor(MERCADOPAGO_TOKEN_REFRESH_QUEUE)
export class MercadoPagoTokenRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(MercadoPagoTokenRefreshProcessor.name);

  constructor(private readonly service: MercadoPagoConnectService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.service.refreshDueAccounts();
    this.logger.log('mercadopago-token-refresh scan completed');
  }
}
