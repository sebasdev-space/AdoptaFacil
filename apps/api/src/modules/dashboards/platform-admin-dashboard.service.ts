import { Injectable } from '@nestjs/common';
import { type PlatformAdminDashboardSummary } from '@adoptafacil/contracts';
import { PlatformDocumentsService } from '../org/platform-documents.service';
import { PlatformDuplicatesService } from '../org/platform-duplicates.service';
import { PlatformReviewsService } from '../reputation/platform-reviews.service';

/**
 * M13 (RF24, S-8) — consolidates the THREE existing PlatformAdmin queues
 * (documents S1-05/S2-06, duplicates S-3, reviews S-7) into one summary.
 * Deliberately calls each queue's own `.queue()` method and takes
 * `.length` — NOT a parallel SQL COUNT — so this number is structurally
 * guaranteed to match what each queue page shows, per RF24's own acceptance
 * criteria ("coincidiendo exactamente con lo que muestra cada cola por
 * separado"). The trade-off (fetching full row payloads just for a count) is
 * accepted deliberately: these queues are small by nature (a handful of
 * pending items), and correctness-by-construction beats a lighter but
 * separately-maintained COUNT query that could drift from the real queue.
 */
@Injectable()
export class PlatformAdminDashboardService {
  constructor(
    private readonly documents: PlatformDocumentsService,
    private readonly duplicates: PlatformDuplicatesService,
    private readonly reviews: PlatformReviewsService,
  ) {}

  async getSummary(): Promise<PlatformAdminDashboardSummary> {
    const [documentsQueue, duplicatesQueue, reviewsQueue] = await Promise.all([
      this.documents.queue(),
      this.duplicates.queue(),
      this.reviews.queue(),
    ]);
    return {
      pendingDocuments: documentsQueue.length,
      pendingDuplicateFlags: duplicatesQueue.length,
      pendingReviews: reviewsQueue.length,
    };
  }
}
