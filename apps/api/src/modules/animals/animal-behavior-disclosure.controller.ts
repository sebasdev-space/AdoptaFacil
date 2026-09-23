import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  type AnimalBehaviorDisclosure,
  type CreateAnimalBehaviorDisclosureInput,
  Role,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { AnimalBehaviorDisclosureService } from './animal-behavior-disclosure.service';
import { createAnimalBehaviorDisclosureSchema } from './animal-behavior-disclosure.schemas';

/** Same "manage the animal" set used elsewhere in M03 (animals.controller.ts) —
 *  this is operational/behavioral knowledge about the animal, not a clinical
 *  record, so it is not restricted to Veterinarian the way clinical events are. */
const WRITE_ROLES = [Role.Owner, Role.Administrator, Role.Operator, Role.Veterinarian] as const;
const VIEW_ROLES = [...WRITE_ROLES, Role.ReadOnlyAuditor] as const;

/**
 * M03 animal behavior disclosure (S-9, FSD v3.5 Doc 4) — tenant-scoped (RLS).
 * The "Safe Harbor" declaration an org must sign BEFORE M04's Placement engine
 * (Fabián) can generate a comodato contract for a salida temporal/hogar de
 * paso. Declaring is append-only: POST always creates a NEW current version,
 * never edits a prior one.
 */
@Controller('animals/:animalId/behavior-disclosures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnimalBehaviorDisclosureController {
  constructor(private readonly service: AnimalBehaviorDisclosureService) {}

  @Get('current')
  @Roles(...VIEW_ROLES)
  getCurrent(
    @Param('animalId', ParseUUIDPipe) animalId: string,
  ): Promise<AnimalBehaviorDisclosure | null> {
    return this.service.getCurrent(animalId);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Body(new ZodValidationPipe(createAnimalBehaviorDisclosureSchema))
    dto: CreateAnimalBehaviorDisclosureInput,
  ): Promise<AnimalBehaviorDisclosure> {
    return this.service.create(actor.id, animalId, dto);
  }
}
