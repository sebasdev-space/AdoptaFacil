import type { PlatformDocumentsService } from '../org/platform-documents.service';
import type { PlatformDuplicatesService } from '../org/platform-duplicates.service';
import type { PlatformReviewsService } from '../reputation/platform-reviews.service';
import { PlatformAdminDashboardService } from './platform-admin-dashboard.service';

function makeService(counts: { documents: number; duplicates: number; reviews: number }) {
  const documents = {
    queue: jest.fn().mockResolvedValue(Array.from({ length: counts.documents })),
  } as unknown as PlatformDocumentsService;
  const duplicates = {
    queue: jest.fn().mockResolvedValue(Array.from({ length: counts.duplicates })),
  } as unknown as PlatformDuplicatesService;
  const reviews = {
    queue: jest.fn().mockResolvedValue(Array.from({ length: counts.reviews })),
  } as unknown as PlatformReviewsService;
  return { service: new PlatformAdminDashboardService(documents, duplicates, reviews) };
}

describe('PlatformAdminDashboardService.getSummary (RF24)', () => {
  it('reports each queue length exactly as-is, with no recalculation', async () => {
    const { service } = makeService({ documents: 3, duplicates: 1, reviews: 5 });

    const summary = await service.getSummary();

    expect(summary).toEqual({
      pendingDocuments: 3,
      pendingDuplicateFlags: 1,
      pendingReviews: 5,
    });
  });

  it('reports 0 for every empty queue', async () => {
    const { service } = makeService({ documents: 0, duplicates: 0, reviews: 0 });

    expect(await service.getSummary()).toEqual({
      pendingDocuments: 0,
      pendingDuplicateFlags: 0,
      pendingReviews: 0,
    });
  });
});
