import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
  Animal as AnimalRow,
  AnimalBreed as BreedRow,
  AnimalPhoto as PhotoRow,
} from '@prisma/client';
import {
  type Animal,
  type AnimalBreed,
  type AnimalPhoto,
  type AnimalPhotoUploadResult,
  type AnimalSex,
  type AnimalSize,
  type AnimalSpecies,
  type AnimalStatus,
  type CreateAnimalBreedInput,
  type CreateAnimalInput,
  type UpdateAnimalInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { computeAge } from './animal-age';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';

type AnimalWithRelations = AnimalRow & { photos: PhotoRow[]; breed: BreedRow | null };

@Injectable()
export class AnimalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  private toPhoto(row: PhotoRow): AnimalPhoto {
    return {
      id: row.id,
      storageRef: row.storageRef,
      order: row.order,
      url: this.storage.resolvePublicUrl(row.storageRef),
    };
  }

  private toAnimal(row: AnimalWithRelations): Animal {
    const photos = [...row.photos].sort((a, b) => a.order - b.order).map((p) => this.toPhoto(p));
    const breedName = row.breed?.name ?? row.customBreed ?? undefined;
    const computedAge = computeAge(row.birthDate, row.approximateAgeMonths, new Date());
    return {
      id: row.id,
      organizationId: row.organizationId,
      name: row.name,
      species: row.species as AnimalSpecies,
      sex: row.sex as AnimalSex,
      size: row.size as AnimalSize,
      status: row.status as AnimalStatus,
      photos: photos.map((p) => p.url),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      breed: breedName,
      birthDate: row.birthDate?.toISOString(),
      approximateAgeMonths: row.approximateAgeMonths ?? undefined,
      description: row.description ?? undefined,
      breedId: row.breedId ?? undefined,
      customBreed: row.customBreed ?? undefined,
      computedAge,
      isActive: row.isActive,
      photoRecords: photos,
    };
  }

  /** Validate that a referenced breed exists in the caller's org and matches the
   *  species (RLS already scopes visibility to the tenant). */
  private async assertBreed(
    tx: Prisma.TransactionClient,
    breedId: string,
    species: string,
  ): Promise<void> {
    const breed = await tx.animalBreed.findUnique({ where: { id: breedId } });
    if (!breed) {
      throw new BadRequestException('Breed not found in this organization');
    }
    if (breed.species !== species) {
      throw new BadRequestException('Breed species does not match the animal species');
    }
  }

  // --- Animals ---------------------------------------------------------------

  /** Create an animal record (expediente) with attributes, status and photos.
   *  Starts active; audited. */
  async create(actorUserId: string, input: CreateAnimalInput): Promise<Animal> {
    const organizationId = this.requireOrgId();

    // Reserve storage targets OUTSIDE the tx (the stub is pure, but a real
    // adapter would do I/O we do not want to hold a DB transaction open for).
    const reserved = await Promise.all(
      (input.photos ?? []).map(async (photo, index) => ({
        storageRef: (
          await this.storage.createUploadTarget({
            organizationId,
            filename: photo.filename,
            contentType: photo.contentType,
          })
        ).key,
        order: photo.order ?? index,
      })),
    );

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      if (input.breedId) {
        await this.assertBreed(tx, input.breedId, input.species);
      }
      const animal = await tx.animal.create({
        data: {
          organizationId,
          name: input.name,
          species: input.species,
          sex: input.sex,
          size: input.size,
          status: input.status ?? 'available',
          breedId: input.breedId ?? null,
          customBreed: input.customBreed ?? null,
          birthDate: input.birthDate ? new Date(input.birthDate) : null,
          approximateAgeMonths: input.approximateAgeMonths ?? null,
          description: input.description ?? null,
          photos:
            reserved.length > 0
              ? { create: reserved.map((r) => ({ organizationId, ...r })) }
              : undefined,
        },
        include: { photos: true, breed: true },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.created',
        entityType: 'animal',
        entityId: animal.id,
        metadata: { species: input.species, status: animal.status, photos: reserved.length },
      });

      return this.toAnimal(animal);
    });
  }

  /** List the org's animals. By default only active records; `includeInactive`
   *  surfaces deactivated ones too. */
  async list(includeInactive = false): Promise<Animal[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.animal.findMany({
        where: { organizationId, ...(includeInactive ? {} : { isActive: true }) },
        include: { photos: true, breed: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return rows.map((row) => this.toAnimal(row));
  }

  /** One animal record (including deactivated), with derived age and photos. */
  async get(id: string): Promise<Animal> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.animal.findUnique({ where: { id }, include: { photos: true, breed: true } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Animal not found');
    }
    return this.toAnimal(row);
  }

  /** Patch an animal record; audited. */
  async update(actorUserId: string, id: string, input: UpdateAnimalInput): Promise<Animal> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.animal.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Animal not found');
      }
      if (input.breedId) {
        await this.assertBreed(tx, input.breedId, input.species ?? existing.species);
      }
      const updated = await tx.animal.update({
        where: { id },
        data: {
          name: input.name,
          species: input.species,
          sex: input.sex,
          size: input.size,
          status: input.status,
          breedId: input.breedId,
          customBreed: input.customBreed,
          birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
          approximateAgeMonths: input.approximateAgeMonths,
          description: input.description,
        },
        include: { photos: true, breed: true },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.updated',
        entityType: 'animal',
        entityId: id,
        metadata: { fields: Object.keys(input) },
      });
      return this.toAnimal(updated);
    });
  }

  /** Soft toggle activation (RF07). NEVER a physical delete; audited. */
  async setActive(actorUserId: string, id: string, isActive: boolean): Promise<Animal> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.animal.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Animal not found');
      }
      const updated = await tx.animal.update({
        where: { id },
        data: { isActive },
        include: { photos: true, breed: true },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: isActive ? 'animal.activated' : 'animal.deactivated',
        entityType: 'animal',
        entityId: id,
      });
      return this.toAnimal(updated);
    });
  }

  // --- Photos ----------------------------------------------------------------

  /** Attach a photo to an animal (metadata only); audited. */
  async addPhoto(
    actorUserId: string,
    animalId: string,
    input: { filename: string; contentType?: string; order?: number },
  ): Promise<AnimalPhotoUploadResult> {
    const organizationId = this.requireOrgId();
    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: input.filename,
      contentType: input.contentType,
    });
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const animal = await tx.animal.findUnique({ where: { id: animalId } });
      if (!animal) {
        throw new NotFoundException('Animal not found');
      }
      const order =
        input.order ??
        ((await tx.animalPhoto.aggregate({ where: { animalId }, _max: { order: true } }))._max
          .order ?? -1) + 1;
      const row = await tx.animalPhoto.create({
        data: { organizationId, animalId, storageRef: stored.key, order },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.photo_added',
        entityType: 'animal',
        entityId: animalId,
        metadata: { order },
      });
      return { photo: this.toPhoto(row), upload: { url: stored.url, key: stored.key } };
    });
  }

  /** Remove a photo from an animal; audited. (The animal record itself is never
   *  physically deleted.) */
  async removePhoto(actorUserId: string, animalId: string, photoId: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const photo = await tx.animalPhoto.findUnique({ where: { id: photoId } });
      if (!photo || photo.animalId !== animalId) {
        throw new NotFoundException('Photo not found');
      }
      await tx.animalPhoto.delete({ where: { id: photoId } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.photo_removed',
        entityType: 'animal',
        entityId: animalId,
        metadata: { photoId },
      });
    });
  }

  // --- Breeds ----------------------------------------------------------------

  /** List the org's custom breeds, optionally filtered by species. */
  async listBreeds(species?: string): Promise<AnimalBreed[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.animalBreed.findMany({
        where: { organizationId, ...(species ? { species } : {}) },
        orderBy: { name: 'asc' },
      }),
    );
    return rows.map(toBreed);
  }

  /** Create a tenant-scoped custom breed; audited. Duplicate (species+name) → 409. */
  async createBreed(actorUserId: string, input: CreateAnimalBreedInput): Promise<AnimalBreed> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.animalBreed.findFirst({
        where: { organizationId, species: input.species, name: input.name },
      });
      if (existing) {
        throw new ConflictException('That breed already exists for this species');
      }
      const row = await tx.animalBreed.create({
        data: { organizationId, species: input.species, name: input.name },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'animal.breed_created',
        entityType: 'animal_breed',
        entityId: row.id,
        metadata: { species: input.species },
      });
      return toBreed(row);
    });
  }
}

function toBreed(row: BreedRow): AnimalBreed {
  return {
    id: row.id,
    organizationId: row.organizationId,
    species: row.species as AnimalSpecies,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}
