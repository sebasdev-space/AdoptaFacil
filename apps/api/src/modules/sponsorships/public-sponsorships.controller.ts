import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { type SponsorshipPublicSummary } from '@adoptafacil/contracts';
import { PublicSponsorshipsService } from './public-sponsorships.service';

/**
 * PUBLIC sponsorship summary (M14/M07, optional/aditivo — RF17) — NO
 * authentication, public columns only, served through a bounded SECURITY
 * DEFINER function. Lets the portal show "this animal has N active sponsors"
 * and the plans available to sponsor it, without ever exposing sponsor identity.
 */
@Controller('public/sponsorships')
export class PublicSponsorshipsController {
  constructor(private readonly service: PublicSponsorshipsService) {}

  @Get('animals/:animalId')
  getAnimalSummary(
    @Param('animalId', ParseUUIDPipe) animalId: string,
  ): Promise<SponsorshipPublicSummary> {
    return this.service.getAnimalSummary(animalId);
  }
}
