import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
// Side-effect import: pulls in @types/multer's ambient `Express.Multer.File`
// augmentation (NOT in tsconfig's explicit `types` array, so it needs an
// explicit reference rather than relying on automatic @types inclusion).
import 'multer';
import {
  type Animal,
  type AnimalBreed,
  type AnimalPhotoUploadResult,
  type AnimalSpecies,
  type BulkImportResultDto,
  type CreateAnimalBreedInput,
  type CreateAnimalInput,
  Role,
  type UpdateAnimalInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { AnimalsService } from './animals.service';
import { BulkImportService } from './bulk-import.service';
import {
  addPhotoSchema,
  createAnimalSchema,
  createBreedSchema,
  updateAnimalSchema,
} from './animals.schemas';

/** Roles that may CREATE/EDIT an animal record (§13 M03 matrix). */
const WRITE_ROLES = [Role.Owner, Role.Administrator, Role.Operator, Role.Veterinarian] as const;
/** Roles that may VIEW (write roles + the read-only auditor). */
const VIEW_ROLES = [...WRITE_ROLES, Role.ReadOnlyAuditor] as const;
/** Roles that may "delete" (soft-remove) a record (S2-04A §3.4) — narrower than
 *  WRITE_ROLES on purpose: Operator/Veterinarian may edit but not remove. */
const DELETE_ROLES = [Role.Owner, Role.Administrator] as const;
/** Roles that may bulk-import animals (S2-04B-1 §restricciones) — same
 *  criterion as creating one manually, MINUS Veterinarian: importing a batch
 *  of records is an org-management action, not a clinical one. */
const BULK_IMPORT_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;
/** Defensive ceiling on the upload itself (a 500-row .xlsx is a few hundred KB
 *  at most) — independent of `BULK_IMPORT_MAX_ROWS`, which caps row COUNT. */
const BULK_IMPORT_MAX_FILE_MB = 10;

interface PhotoDto {
  filename: string;
  contentType?: string;
  order?: number;
}

/**
 * M03 animal record (expediente, RF07) — tenant-scoped (RLS). Create/edit/toggle
 * = Owner/Administrator/Operator/Veterinarian; view = + ReadOnlyAuditor; everyone
 * else is denied (deny-by-default). The record is soft-disabled, never physically
 * deleted. `breeds` routes are declared before `:id` so they never match `:id`.
 */
@Controller('animals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnimalsController {
  constructor(
    private readonly service: AnimalsService,
    private readonly bulkImport: BulkImportService,
  ) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createAnimalSchema)) dto: CreateAnimalInput,
  ): Promise<Animal> {
    return this.service.create(actor.id, dto);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  list(@Query('includeInactive') includeInactive?: string): Promise<Animal[]> {
    return this.service.list(includeInactive === 'true');
  }

  // --- Breeds (declared before ':id' to avoid the param route capturing it) ---

  @Get('breeds')
  @Roles(...VIEW_ROLES)
  listBreeds(@Query('species') species?: string): Promise<AnimalBreed[]> {
    return this.service.listBreeds(species as AnimalSpecies | undefined);
  }

  @Post('breeds')
  @Roles(...WRITE_ROLES)
  createBreed(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createBreedSchema)) dto: CreateAnimalBreedInput,
  ): Promise<AnimalBreed> {
    return this.service.createBreed(actor.id, dto);
  }

  // --- Bulk import (S2-04B-1; declared before ':id' for the same reason as
  // 'breeds' above) ------------------------------------------------------------

  @Get('bulk-import/template')
  @Roles(...BULK_IMPORT_ROLES)
  async downloadBulkImportTemplate(@Res() res: Response): Promise<void> {
    const buffer = await this.bulkImport.generateTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-animales.xlsx"');
    res.send(buffer);
  }

  @Post('bulk-import')
  @Roles(...BULK_IMPORT_ROLES)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: BULK_IMPORT_MAX_FILE_MB * 1024 * 1024 } }),
  )
  importAnimals(
    @CurrentUser() actor: RequestUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<BulkImportResultDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Se requiere un archivo .xlsx (campo "file")');
    }
    return this.bulkImport.importFile(actor.id, file.buffer);
  }

  // --- Single animal ---------------------------------------------------------

  @Get(':id')
  @Roles(...VIEW_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Animal> {
    return this.service.get(id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAnimalSchema)) dto: UpdateAnimalInput,
  ): Promise<Animal> {
    return this.service.update(actor.id, id, dto);
  }

  @Post(':id/activate')
  @Roles(...WRITE_ROLES)
  activate(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Animal> {
    return this.service.setActive(actor.id, id, true);
  }

  @Post(':id/deactivate')
  @Roles(...WRITE_ROLES)
  deactivate(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Animal> {
    return this.service.setActive(actor.id, id, false);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...DELETE_ROLES)
  remove(@CurrentUser() actor: RequestUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.remove(actor.id, id);
  }

  @Post(':id/photos')
  @Roles(...WRITE_ROLES)
  addPhoto(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addPhotoSchema)) dto: PhotoDto,
  ): Promise<AnimalPhotoUploadResult> {
    return this.service.addPhoto(actor.id, id, dto);
  }

  @Delete(':id/photos/:photoId')
  @HttpCode(204)
  @Roles(...WRITE_ROLES)
  removePhoto(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ): Promise<void> {
    return this.service.removePhoto(actor.id, id, photoId);
  }
}
