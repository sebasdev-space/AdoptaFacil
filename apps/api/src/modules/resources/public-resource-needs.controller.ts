import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { type ResourceNeedPublic, type ResourceNeedsPage } from '@adoptafacil/contracts';
import { PublicResourceNeedsService } from './public-resource-needs.service';

/**
 * PUBLIC resource-need catalog (M09) — NO authentication, public columns
 * only, served through bounded SECURITY DEFINER functions. Lists needs still
 * accepting help across organizations and exposes a single need's detail
 * (donors browse here before offering — offering itself requires auth, see
 * `ResourceOffersController`).
 */
@Controller('public/resources/needs')
export class PublicResourceNeedsController {
  constructor(private readonly service: PublicResourceNeedsService) {}

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ResourceNeedsPage> {
    return this.service.list(Number(limit), Number(offset));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<ResourceNeedPublic> {
    const need = await this.service.get(id);
    if (!need) {
      throw new NotFoundException('Resource need not found');
    }
    return need;
  }
}
