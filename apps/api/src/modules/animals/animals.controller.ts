import {
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
  UseGuards,
} from '@nestjs/common';
import {
  type Animal,
  type AnimalBreed,
  type AnimalPhotoUploadResult,
  type AnimalSpecies,
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
  constructor(private readonly service: AnimalsService) {}

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
