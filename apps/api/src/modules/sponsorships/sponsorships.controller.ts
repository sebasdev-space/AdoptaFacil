import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateSponsorshipInput,
  type Paginated,
  Role,
  type Sponsorship,
  type SponsorshipPayment,
  SponsorshipStatus,
  type SponsorshipStatusChangeInput,
  type SponsorshipStatusHistoryEntry,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { SponsorshipPaymentsService } from './sponsorship-payments.service';
import { SponsorshipsService } from './sponsorships.service';
import { createSponsorshipSchema, sponsorshipStatusChangeSchema } from './sponsorships.schemas';

/** Roles that may suspend/reactivate/cancel a sponsorship (§13 M07). */
const MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;
/** Roles that may VIEW internally (manage roles + the read-only auditor). */
const VIEW_ROLES = [...MANAGE_ROLES, Role.ReadOnlyAuditor] as const;

/**
 * M07 sponsorships (RF17 · T-056) — tenant-scoped (RLS). Subscribing is open to
 * ANY authenticated Person (the padrino, cross-tenant by design); managing the
 * lifecycle (suspend/reactivate/cancel) and viewing internally is
 * Owner/Administrator (+ ReadOnlyAuditor for viewing) — deny-by-default for
 * everyone else. This slice does NOT process any payment (TODO T-057).
 */
@Controller('sponsorships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SponsorshipsController {
  constructor(
    private readonly service: SponsorshipsService,
    private readonly payments: SponsorshipPaymentsService,
  ) {}

  /** Subscribe to a plan — any authenticated Person (no @Roles gate). */
  @Post()
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createSponsorshipSchema)) dto: CreateSponsorshipInput,
  ): Promise<Sponsorship> {
    return this.service.subscribe(actor, dto);
  }

  /** Recovery after auto-suspension by billing failure (Objetivo 6) — any
   *  authenticated Person may retry ONLY their own suspended sponsorship (no
   *  @Roles gate, ownership checked cross-tenant inside the service). */
  @Post(':id/retry-payment')
  @HttpCode(200)
  retryPayment(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SponsorshipPayment> {
    return this.payments.retryPayment(actor, id);
  }

  /** The sponsor's own sponsorships (cross-tenant, by identity) — "mis
   *  apadrinamientos" (S2-03). No @Roles gate, same as `create` above: any
   *  authenticated Person may view their OWN subscriptions. */
  @Get('mine')
  listMine(@CurrentUser() actor: RequestUser): Promise<Sponsorship[]> {
    return this.service.listMine(actor);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('animalId') animalId?: string,
    @Query('status') status?: SponsorshipStatus,
  ): Promise<Paginated<Sponsorship>> {
    return this.service.list(Number(limit), Number(offset), { animalId, status });
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Sponsorship> {
    return this.service.get(id);
  }

  /** Immutable status history ("historial") of a sponsorship. */
  @Get(':id/history')
  @Roles(...VIEW_ROLES)
  history(@Param('id', ParseUUIDPipe) id: string): Promise<SponsorshipStatusHistoryEntry[]> {
    return this.service.history(id);
  }

  /** Recurring-billing ledger (S-5-REDISEÑO): every period + every attempt. */
  @Get(':id/payments')
  @Roles(...VIEW_ROLES)
  listPayments(@Param('id', ParseUUIDPipe) id: string): Promise<SponsorshipPayment[]> {
    return this.payments.listForSponsorship(id);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  suspend(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sponsorshipStatusChangeSchema)) dto: SponsorshipStatusChangeInput,
  ): Promise<Sponsorship> {
    return this.service.suspend(actor.id, id, dto.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  reactivate(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sponsorshipStatusChangeSchema)) dto: SponsorshipStatusChangeInput,
  ): Promise<Sponsorship> {
    return this.service.reactivate(actor.id, id, dto.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  cancel(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sponsorshipStatusChangeSchema)) dto: SponsorshipStatusChangeInput,
  ): Promise<Sponsorship> {
    return this.service.cancel(actor.id, id, dto.reason);
  }
}
