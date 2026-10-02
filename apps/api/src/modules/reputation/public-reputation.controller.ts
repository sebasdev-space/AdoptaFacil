import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreatePublicReviewInput,
  type OrganizationReputationSummary,
  type Paginated,
  type PublicReview,
  type Review,
} from '@adoptafacil/contracts';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { PublicReputationService } from './public-reputation.service';
import { createPublicReviewSchema } from './reviews.schemas';

/**
 * Public reputation indicators (RF23 · M12) — NO auth, mirrors
 * `PublicOrgCampaignsController`/M08's `public-volunteering.controller.ts`
 * (empty controller prefix, explicit `public/...` path per route).
 */
@Controller()
export class PublicReputationController {
  constructor(private readonly service: PublicReputationService) {}

  @Get('public/organizations/:slug/reputation-summary')
  async summary(@Param('slug') slug: string): Promise<OrganizationReputationSummary> {
    const summary = await this.service.getSummaryByOrgSlug(slug);
    if (!summary) {
      throw new NotFoundException('Organization not found');
    }
    return summary;
  }

  @Get('public/organizations/:slug/reviews')
  async reviews(
    @Param('slug') slug: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<PublicReview>> {
    const page = await this.service.listApprovedByOrgSlug(slug, Number(limit), Number(offset));
    if (!page) {
      throw new NotFoundException('Organization not found');
    }
    return page;
  }

  /**
   * Botón "Registrar reseña" del portal público (S7-b) — sin sesión, siempre
   * anónima, queda visible de inmediato. Deliberadamente distinto de
   * `POST /reviews` (RF23 original: exige sesión + interacción real) — este
   * camino es SOLO el que el cliente pidió para el portal.
   */
  @Post('public/organizations/:slug/reviews')
  @HttpCode(201)
  createReview(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(createPublicReviewSchema)) dto: CreatePublicReviewInput,
  ): Promise<Review> {
    return this.service.createPublicReview(slug, dto);
  }
}
