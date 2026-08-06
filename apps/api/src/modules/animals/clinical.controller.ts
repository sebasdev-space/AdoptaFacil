import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  type ClinicalCarnetEntry,
  type ClinicalEvent,
  type CreateClinicalEventInput,
  type EditClinicalEventInput,
  Role,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { CarnetService } from './carnet.service';
import { ClinicalService } from './clinical.service';
import { createClinicalEventSchema, editClinicalEventSchema } from './clinical.schemas';

/** Roles that may VIEW the clinical record (manage/see the animal, §13 M03).
 *  S2-04B-2 TODO(client): whether a Persona/adoptante should see the carnet
 *  (public in the portal, or only after a formalized adoption) is NOT
 *  decided — until then, the carnet routes below stay behind this SAME set,
 *  so a Persona (no org role) is denied by default, no extra code needed. */
const VIEW_ROLES = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Veterinarian,
  Role.ReadOnlyAuditor,
] as const;

/**
 * M03 clinical record (expediente clínico, RF08) — tenant-scoped (RLS). Per the
 * base-document matrix, CREATING/EDITING a clinical event is restricted to the
 * Veterinarian; the rest of the animal-facing roles (Owner/Administrator/
 * Operator/Veterinarian/ReadOnlyAuditor) may only VIEW. Editing never overwrites:
 * it appends an immutable new version.
 */
@Controller('animals/:animalId/clinical-events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClinicalController {
  constructor(
    private readonly service: ClinicalService,
    private readonly carnet: CarnetService,
  ) {}

  @Get()
  @Roles(...VIEW_ROLES)
  list(@Param('animalId', ParseUUIDPipe) animalId: string): Promise<ClinicalEvent[]> {
    return this.service.listCurrent(animalId);
  }

  // --- Carnet de vacunación (S2-04B-2; read-only, declared before ':eventId'
  // — same reasoning as 'breeds' in animals.controller.ts, though 'carnet'/
  // 'carnet.pdf' are single segments and ':eventId' routes here are all
  // two-segment (':eventId/history') or POST, so there is no real collision;
  // kept together for readability). ---

  @Get('carnet')
  @Roles(...VIEW_ROLES)
  carnetTimeline(
    @Param('animalId', ParseUUIDPipe) animalId: string,
  ): Promise<ClinicalCarnetEntry[]> {
    return this.carnet.getTimeline(animalId);
  }

  @Get('carnet.pdf')
  @Roles(...VIEW_ROLES)
  async carnetPdf(
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.carnet.generateCarnetPdf(animalId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="carnet.pdf"');
    res.send(buffer);
  }

  @Post()
  @Roles(Role.Veterinarian)
  create(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Body(new ZodValidationPipe(createClinicalEventSchema)) dto: CreateClinicalEventInput,
  ): Promise<ClinicalEvent> {
    return this.service.create(actor.id, animalId, dto);
  }

  @Get(':eventId/history')
  @Roles(...VIEW_ROLES)
  history(
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ): Promise<ClinicalEvent[]> {
    return this.service.history(animalId, eventId);
  }

  @Post(':eventId')
  @Roles(Role.Veterinarian)
  edit(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(editClinicalEventSchema)) dto: EditClinicalEventInput,
  ): Promise<ClinicalEvent> {
    return this.service.edit(actor.id, animalId, eventId, dto);
  }
}
