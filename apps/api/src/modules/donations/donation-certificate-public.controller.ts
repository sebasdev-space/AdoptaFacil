import { Controller, Get, Param } from '@nestjs/common';
import type { DonationCertificateVerification } from '@adoptafacil/contracts';
import { DonationCertificatesService } from './donation-certificates.service';

/**
 * PUBLIC certificate verification (F-3, RF14) — no auth. Separate controller
 * (no `donations/` prefix, unlike {@link DonationsController}) so this route
 * can live at `public/donations/certificates/:code`, same convention as
 * `OrgController`/`PortalThemeController`'s public reads.
 */
@Controller()
export class DonationCertificatePublicController {
  constructor(private readonly certificates: DonationCertificatesService) {}

  @Get('public/donations/certificates/:code')
  getPublic(@Param('code') code: string): Promise<DonationCertificateVerification> {
    return this.certificates.getPublicByCode(code);
  }
}
