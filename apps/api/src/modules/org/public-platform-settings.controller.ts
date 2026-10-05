import { Controller, Get } from '@nestjs/common';
import type { PublicHeroBanner } from '@adoptafacil/contracts';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * Public read of the platform's hero banner photos (S-15) — the general
 * portal ("/") shows this to an ANONYMOUS visitor, so no guard here (same
 * convention as `PublicReputationController`/`public/organizations/:slug`:
 * plain `@Controller()`, explicit `public/...` path per route). Only the
 * narrow subset `PlatformSettings` the banner actually needs — never the full
 * record (`showOrganizationType` stays admin-only).
 */
@Controller()
export class PublicPlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  @Get('public/hero-banner')
  getHeroBanner(): Promise<PublicHeroBanner> {
    return this.service.getPublicHeroBanner();
  }
}
