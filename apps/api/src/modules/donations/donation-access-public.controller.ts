import { Controller, Get, Param } from '@nestjs/common';
import type { GuestDonationAccess } from '@adoptafacil/contracts';
import { DonationsService } from './donations.service';

/**
 * PUBLIC guest donation access (client requirement, final: a guest donor must
 * be able to check their donation — status/receipt/certificate — without ever
 * creating an account). No auth: the token itself IS the credential, same
 * shape as {@link DonationCertificatePublicController} — no `donations/`
 * prefix, its own minimal controller, `public/donations/access/:token`.
 * `DonationsService.getByAccessToken` returns a single generic 404 whether
 * the token is missing, malformed, unknown, or expired — never distinguished.
 */
@Controller()
export class DonationAccessPublicController {
  constructor(private readonly service: DonationsService) {}

  @Get('public/donations/access/:token')
  getByToken(@Param('token') token: string): Promise<GuestDonationAccess> {
    return this.service.getByAccessToken(token);
  }
}
