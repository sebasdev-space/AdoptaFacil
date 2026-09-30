import { Controller, Get, Param } from '@nestjs/common';
import type { DonationPublicStatus } from '@adoptafacil/contracts';
import { DonationsService } from './donations.service';

/**
 * PUBLIC post-checkout status read (MercadoPago redirect-back "gracias"
 * page) — no auth. Same minimal-controller convention as
 * {@link DonationCertificatePublicController}/{@link DonationAccessPublicController}:
 * no `donations/` prefix, one route, a single generic 404 on an unknown
 * reference (never distinguishable from "not yet settled").
 *
 * `:reference` is MercadoPago's `external_reference` query param, which the
 * frontend forwards verbatim — it IS our own `donations.collection_id`
 * (`af-<idempotencyKey>`, see `MercadoPagoPaymentAdapter.createCollection`).
 */
@Controller()
export class DonationStatusPublicController {
  constructor(private readonly service: DonationsService) {}

  @Get('public/donations/status/:reference')
  getPublic(@Param('reference') reference: string): Promise<DonationPublicStatus> {
    return this.service.getPublicStatusByCollectionId(reference);
  }
}
