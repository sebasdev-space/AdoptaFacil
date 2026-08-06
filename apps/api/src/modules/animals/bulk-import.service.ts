import * as ExcelJS from 'exceljs';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type {
  AnimalBreed,
  AnimalSpecies,
  BulkImportResultDto,
  BulkImportRowError,
  CreateAnimalInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AnimalsService } from './animals.service';
import {
  BULK_IMPORT_HEADERS,
  BULK_IMPORT_MAX_ROWS,
  bulkImportRowSchema,
  mapSexLabel,
  mapSizeLabel,
  mapSpeciesLabel,
  normalizeLabel,
  parseTagsCell,
} from './bulk-import.schemas';

const EXAMPLE_ROW = [
  'Firulais',
  'Perro',
  'Labrador Retriever',
  'Macho',
  'Mediano',
  '2023-05-10',
  'Rescatado en buen estado de salud, muy sociable.',
  'Juguetón, Cariñoso',
];

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  species: 'Especie',
  sex: 'Sexo',
  size: 'Tamaño',
  breedName: 'Raza',
  birthDate: 'Fecha de nacimiento',
  description: 'Descripción',
  tags: 'Etiquetas',
};

/**
 * Bulk import of animals from an .xlsx file (S2-04B-1, RF07). Reuses
 * `AnimalsService.create` per valid row — same breed/tenant rules, same
 * per-animal audit trail — instead of re-implementing creation. A parse
 * failure on one row never aborts the file (§restricciones: "validación no
 * bloqueante"); it's reported and the rest keep processing.
 */
@Injectable()
export class BulkImportService {
  constructor(
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly animals: AnimalsService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** `.xlsx` template with the expected columns + one example row. */
  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Animales');
    sheet.addRow([...BULK_IMPORT_HEADERS]);
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(EXAMPLE_ROW);
    sheet.columns.forEach((column) => {
      column.width = 24;
    });
    // exceljs ships its own `Buffer` type alias that doesn't structurally match
    // @types/node's in this TS version, despite being a real Node Buffer at
    // runtime — narrow the type, not the value.
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  /** Map the header row to column numbers, ignoring any unrecognized column
   *  (this is ALSO what keeps a spoofed "organization_id" column from ever
   *  being read — only known headers are looked up). */
  private mapColumns(headerRow: ExcelJS.Row): Map<string, number> {
    const known = new Map(BULK_IMPORT_HEADERS.map((h) => [normalizeLabel(h), h]));
    const columns = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      const label = known.get(normalizeLabel(cell.value));
      if (label) {
        columns.set(label, colNumber);
      }
    });
    return columns;
  }

  private cellText(row: ExcelJS.Row, columns: Map<string, number>, header: string): unknown {
    const col = columns.get(header);
    if (!col) return undefined;
    const value = row.getCell(col).value;
    if (value && typeof value === 'object' && 'text' in value) {
      return (value as { text: string }).text;
    }
    return value;
  }

  private parseBirthDate(value: unknown): { iso?: string; invalid: boolean } {
    if (value === undefined || value === null || value === '') {
      return { invalid: false };
    }
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return { invalid: true };
    }
    return { iso: date.toISOString(), invalid: false };
  }

  /** Parse + validate + create. Never throws for a bad ROW — only for a bad
   *  FILE (unreadable, wrong shape, over the row cap). */
  async importFile(actorUserId: string, buffer: Buffer): Promise<BulkImportResultDto> {
    const organizationId = this.requireOrgId();

    const workbook = new ExcelJS.Workbook();
    try {
      // Same exceljs/@types-node Buffer type mismatch as generateTemplate().
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException(
        'Archivo no válido. Sube un archivo .xlsx generado con la plantilla.',
      );
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('El archivo no tiene ninguna hoja.');
    }

    const columns = this.mapColumns(sheet.getRow(1));
    const nameCol = columns.get('Nombre');

    // Only rows with SOMETHING in "Nombre" count as data (trailing blank rows
    // Excel sometimes keeps around are skipped, not counted or reported).
    const dataRowNumbers: number[] = [];
    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const hasName = nameCol ? String(row.getCell(nameCol).value ?? '').trim().length > 0 : false;
      if (hasName || row.actualCellCount > 0) {
        dataRowNumbers.push(r);
      }
    }

    if (dataRowNumbers.length > BULK_IMPORT_MAX_ROWS) {
      throw new BadRequestException(
        `El archivo tiene ${dataRowNumbers.length} filas; el máximo permitido por ` +
          `importación es ${BULK_IMPORT_MAX_ROWS}.`,
      );
    }

    const breedCache = new Map<AnimalSpecies, AnimalBreed[]>();
    const loadBreeds = async (species: AnimalSpecies): Promise<AnimalBreed[]> => {
      const cached = breedCache.get(species);
      if (cached) return cached;
      const rows = await this.animals.listBreeds(species);
      breedCache.set(species, rows);
      return rows;
    };

    const errors: BulkImportRowError[] = [];
    let created = 0;

    for (const r of dataRowNumbers) {
      const row = sheet.getRow(r);

      const speciesLabel = this.cellText(row, columns, 'Especie');
      const species = mapSpeciesLabel(speciesLabel);
      if (!species) {
        errors.push({
          row: r,
          field: 'Especie',
          message: 'Especie no reconocida (usa Perro, Gato u Otro).',
        });
        continue;
      }

      const { iso: birthDate, invalid: invalidDate } = this.parseBirthDate(
        this.cellText(row, columns, 'Fecha de nacimiento'),
      );
      if (invalidDate) {
        errors.push({ row: r, field: 'Fecha de nacimiento', message: 'Fecha inválida.' });
        continue;
      }

      const candidate = {
        name: String(this.cellText(row, columns, 'Nombre') ?? '').trim(),
        species,
        sex: mapSexLabel(this.cellText(row, columns, 'Sexo')) ?? 'unknown',
        size: mapSizeLabel(this.cellText(row, columns, 'Tamaño')) ?? 'medium',
        breedName: String(this.cellText(row, columns, 'Raza') ?? '').trim() || undefined,
        birthDate,
        description: String(this.cellText(row, columns, 'Descripción') ?? '').trim() || undefined,
        tags: parseTagsCell(this.cellText(row, columns, 'Etiquetas')),
      };

      const parsed = bulkImportRowSchema.safeParse(candidate);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const field = String(issue.path[0] ?? '');
        errors.push({
          row: r,
          field: FIELD_LABELS[field] ?? field,
          message: issue.message,
        });
        continue;
      }

      // Breed referenced by NAME (the spreadsheet has no internal ids) — must
      // already exist in the org's catalog. TODO(client): today an unknown
      // breed REJECTS the row; auto-creating it instead is the alternative,
      // left parametrizable per the spec until the client decides.
      let breedId: string | undefined;
      if (parsed.data.breedName) {
        const breeds = await loadBreeds(species);
        const match = breeds.find(
          (b) => b.name.toLowerCase() === parsed.data.breedName!.toLowerCase(),
        );
        if (!match) {
          errors.push({
            row: r,
            field: 'Raza',
            message: `La raza "${parsed.data.breedName}" no existe en el catálogo de la organización.`,
          });
          continue;
        }
        breedId = match.id;
      }

      const input: CreateAnimalInput = {
        name: parsed.data.name,
        species: parsed.data.species,
        sex: parsed.data.sex,
        size: parsed.data.size,
        ...(breedId ? { breedId } : {}),
        ...(parsed.data.birthDate ? { birthDate: parsed.data.birthDate } : {}),
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        ...(parsed.data.tags && parsed.data.tags.length > 0 ? { tags: parsed.data.tags } : {}),
      };

      try {
        await this.animals.create(actorUserId, input);
        created += 1;
      } catch (error) {
        errors.push({
          row: r,
          message: error instanceof Error ? error.message : 'No se pudo crear el animal.',
        });
      }
    }

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'animal.bulk_import_completed',
      entityType: 'animal_bulk_import',
      metadata: { totalRows: dataRowNumbers.length, created, failed: errors.length },
    });

    return { totalRows: dataRowNumbers.length, created, failed: errors.length, errors };
  }
}
