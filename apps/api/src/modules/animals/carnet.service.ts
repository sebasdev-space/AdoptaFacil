import { ForbiddenException, Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { type ClinicalCarnetEntry, ClinicalEventType } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AnimalsService } from './animals.service';
import { ClinicalService } from './clinical.service';

const TYPE_LABELS: Record<ClinicalEventType, string> = {
  [ClinicalEventType.Vaccine]: 'Vacuna',
  [ClinicalEventType.Treatment]: 'Tratamiento',
  [ClinicalEventType.Surgery]: 'Cirugía',
  [ClinicalEventType.Sterilization]: 'Esterilización',
  [ClinicalEventType.Allergy]: 'Alergia',
  [ClinicalEventType.Disability]: 'Incapacidad',
  [ClinicalEventType.Medication]: 'Medicamento',
  [ClinicalEventType.Diagnosis]: 'Diagnóstico',
};

function formatCO(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * "Carnet de vacunación" (S2-04B-2, RF08/RF09) — read-only projection over the
 * clinical model built in the Ola 1 (`ClinicalEvent`/`ClinicalService`). Adds
 * NO new write surface: reuses `ClinicalService.listCurrent` (already sorted
 * most-recent-first) and `AnimalsService.get` (for the 404 guard + the
 * animal's name), only enriching with the author's display name and, for the
 * PDF, rendering the same data.
 *
 * TODO(client) — visibility for a Persona/adoptante is NOT decided yet
 * (public-in-portal vs. only-after-formalized-adoption). Until the client
 * answers, this stays behind the SAME `VIEW_ROLES` as the rest of the
 * clinical record (org roles only) — a Persona has none, so deny-by-default
 * already applies with zero extra code.
 */
@Injectable()
export class CarnetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly animals: AnimalsService,
    private readonly clinical: ClinicalService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Timeline entries (current version of each event), most-recent-first —
   *  same order `listCurrent` already returns. TODO(client): confirm whether
   *  chronological (oldest-first) is preferred instead; not specified. */
  async getTimeline(animalId: string): Promise<ClinicalCarnetEntry[]> {
    const organizationId = this.requireOrgId();
    // Reuses the SAME 404 guard as every other single-animal read (RLS-backed
    // — a foreign-org animal id looks identical to a missing one).
    await this.animals.get(animalId);

    const events = await this.clinical.listCurrent(animalId);
    if (events.length === 0) return [];

    const authorIds = [...new Set(events.map((e) => e.authorUserId))];
    const authors = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, displayName: true },
      }),
    );
    const nameById = new Map(authors.map((a) => [a.id, a.displayName]));

    return events.map((event) => ({
      ...event,
      authorName: nameById.get(event.authorUserId) ?? 'Autor no disponible',
    }));
  }

  /** Renders the SAME timeline as a simple, legible PDF (org name + animal
   *  name as header, one block per event). Logo embedding is intentionally
   *  skipped in this first cut — `logoUrl` is a URL, not a StoragePort key,
   *  so embedding it would mean the API fetching its own HTTP endpoint; the
   *  org NAME already identifies the document unambiguously. */
  async generateCarnetPdf(animalId: string): Promise<Buffer> {
    const organizationId = this.requireOrgId();
    const animal = await this.animals.get(animalId);
    const entries = await this.getTimeline(animalId);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const margin = 50;
    const pageSize: [number, number] = [595.28, 841.89]; // A4

    let page = pdf.addPage(pageSize);
    let y = pageSize[1] - margin;

    function ensureSpace(height: number): void {
      if (y - height < margin) {
        page = pdf.addPage(pageSize);
        y = pageSize[1] - margin;
      }
    }

    function drawLine(text: string, options: { size?: number; useBold?: boolean } = {}): void {
      const size = options.size ?? 11;
      ensureSpace(size + 6);
      page.drawText(text, {
        x: margin,
        y,
        size,
        font: options.useBold ? bold : font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= size + 6;
    }

    drawLine(org?.name ?? 'AdoptaFácil', { size: 12, useBold: true });
    drawLine('Carnet de vacunación / expediente clínico', { size: 16, useBold: true });
    drawLine(`Animal: ${animal.name}`, { size: 12 });
    y -= 8;

    if (entries.length === 0) {
      drawLine('Sin eventos clínicos registrados.', { size: 11 });
    } else {
      for (const entry of entries) {
        ensureSpace(60);
        drawLine(`${TYPE_LABELS[entry.type]} — ${formatCO(entry.occurredAt)}`, {
          size: 12,
          useBold: true,
        });
        drawLine(`Autor: ${entry.authorName}`, { size: 10 });
        if (entry.nextDueDate) {
          drawLine(`Próxima fecha: ${formatCO(entry.nextDueDate)}`, { size: 10 });
        }
        if (entry.attachments.length > 0) {
          drawLine(`Adjuntos: ${entry.attachments.length}`, { size: 10 });
        }
        y -= 6;
      }
    }

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}
