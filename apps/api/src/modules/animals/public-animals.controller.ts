import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { AnimalSummaryPage } from '@adoptafacil/contracts';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { PublicAnimalsService } from './public-animals.service';
import { type PublicAnimalsQuery, publicAnimalsQuerySchema } from './public-animals.schemas';

/**
 * PUBLIC adoption catalog (T-029, RF07). No authentication: exposes only the
 * ADOPTABLE animals (is_active + status=available) of ONE organization, looked up
 * by its public portal slug, through a bounded SECURITY DEFINER function — never
 * the clinical record, reminders, documents, or another org's data. Mandatory,
 * server-capped pagination; optional species filter. Mirrors the public
 * `GET /public/organizations/:slug` endpoint.
 */
@Controller()
export class PublicAnimalsController {
  constructor(private readonly service: PublicAnimalsService) {}

  @Get('public/organizations/:slug/animals')
  async list(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(publicAnimalsQuerySchema)) query: PublicAnimalsQuery,
  ): Promise<AnimalSummaryPage> {
    const page = await this.service.listAdoptable(slug, query);
    if (!page) {
      throw new NotFoundException('Organization not found');
    }
    return page;
  }
}
