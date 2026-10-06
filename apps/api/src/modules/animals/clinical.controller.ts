import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  type AnimalCardInfo,
  type ClinicalAttachmentUploadTarget,
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
import {
  createAttachmentUploadSchema,
  createClinicalEventSchema,
  editClinicalEventSchema,
} from './clinical.schemas';

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
 * Roles that may CREATE/EDIT a clinical event + upload its attachments (fix,
 * 2026-10: previously Veterinarian-only — confirmed with the client that the
 * Owner, same as the rest of the roles that manage the animal record
 * day-to-day, should be able to register one too; not every shelter has a
 * dedicated vet account). Same set as `WRITE_ROLES` in `animals.controller.ts`.
 */
const WRITE_ROLES = [Role.Owner, Role.Administrator, Role.Operator, Role.Veterinarian] as const;

/**
 * M03 clinical record (expediente clínico, RF08) — tenant-scoped (RLS). Editing
 * never overwrites: it appends an immutable new version.
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

  /** Datos del carnet de identificación (código N° y URL del QR). */
  @Get('card')
  @Roles(...VIEW_ROLES)
  carnetCard(@Param('animalId', ParseUUIDPipe) animalId: string): Promise<AnimalCardInfo> {
    return this.carnet.getCardInfo(animalId);
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
  @Roles(...WRITE_ROLES)
  create(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Body(new ZodValidationPipe(createClinicalEventSchema)) dto: CreateClinicalEventInput,
  ): Promise<ClinicalEvent> {
    return this.service.create(actor.id, animalId, dto);
  }

  /** Reserve a storage target for ONE clinical attachment (fix,
   *  T-ANIMALS-ATTACHMENTS-AUDIT) — the client PUTs the bytes to the returned
   *  `url`, then passes `key` back as `storageRef` in the create/edit call's
   *  `attachments`. Declared before ':eventId' (same reasoning as 'carnet'/
   *  'card' above — a literal segment, never confused with an event id). */
  @Post('uploads')
  @Roles(...WRITE_ROLES)
  createUpload(
    @Body(new ZodValidationPipe(createAttachmentUploadSchema))
    dto: {
      filename: string;
      contentType?: string;
    },
  ): Promise<ClinicalAttachmentUploadTarget> {
    return this.service.reserveAttachmentUpload(dto);
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
  @Roles(...WRITE_ROLES)
  edit(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(editClinicalEventSchema)) dto: EditClinicalEventInput,
  ): Promise<ClinicalEvent> {
    return this.service.edit(actor.id, animalId, eventId, dto);
  }
}
