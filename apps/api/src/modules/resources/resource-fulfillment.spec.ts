import {
  ResourceDeliveryStatus,
  ResourceNeedStatus,
  ResourceOfferStatus,
} from '@adoptafacil/contracts';
import {
  canDecideOffer,
  canTransitionDelivery,
  computeFulfillmentProgress,
  deriveNeedStatus,
  needAcceptsOffers,
} from './resource-fulfillment';

describe('computeFulfillmentProgress (M09)', () => {
  it('0 fulfilled → 0 progress', () => {
    expect(computeFulfillmentProgress(0, 20)).toBe(0);
  });

  it('partial fulfillment → fraction', () => {
    expect(computeFulfillmentProgress(5, 20)).toBe(0.25);
  });

  it('exactly fulfilled → 1', () => {
    expect(computeFulfillmentProgress(20, 20)).toBe(1);
  });

  it('over-fulfilled (delivered more than needed) clamps to 1', () => {
    expect(computeFulfillmentProgress(30, 20)).toBe(1);
  });

  it('a need with quantityNeeded <= 0 never divides by zero', () => {
    expect(computeFulfillmentProgress(0, 0)).toBe(0);
    expect(computeFulfillmentProgress(5, 0)).toBe(0);
  });
});

describe('deriveNeedStatus (M09)', () => {
  it('nothing fulfilled → needed', () => {
    expect(deriveNeedStatus(0, 20, ResourceNeedStatus.Needed)).toBe(ResourceNeedStatus.Needed);
  });

  it('partial amounts → partially_fulfilled', () => {
    expect(deriveNeedStatus(5, 20, ResourceNeedStatus.Needed)).toBe(
      ResourceNeedStatus.PartiallyFulfilled,
    );
  });

  it('fully fulfilled → fulfilled', () => {
    expect(deriveNeedStatus(20, 20, ResourceNeedStatus.PartiallyFulfilled)).toBe(
      ResourceNeedStatus.Fulfilled,
    );
  });

  it('over-fulfilled (delivered more than needed) → still fulfilled', () => {
    expect(deriveNeedStatus(25, 20, ResourceNeedStatus.PartiallyFulfilled)).toBe(
      ResourceNeedStatus.Fulfilled,
    );
  });

  it('cancelled is sticky: a stray completed delivery never revives it', () => {
    expect(deriveNeedStatus(20, 20, ResourceNeedStatus.Cancelled)).toBe(
      ResourceNeedStatus.Cancelled,
    );
  });
});

describe('needAcceptsOffers (M09)', () => {
  it('needed/partially_fulfilled accept offers', () => {
    expect(needAcceptsOffers(ResourceNeedStatus.Needed)).toBe(true);
    expect(needAcceptsOffers(ResourceNeedStatus.PartiallyFulfilled)).toBe(true);
  });

  it('fulfilled/cancelled never accept a new offer', () => {
    expect(needAcceptsOffers(ResourceNeedStatus.Fulfilled)).toBe(false);
    expect(needAcceptsOffers(ResourceNeedStatus.Cancelled)).toBe(false);
  });
});

describe('canDecideOffer (M09)', () => {
  it('only "offered" can be decided/cancelled', () => {
    expect(canDecideOffer(ResourceOfferStatus.Offered)).toBe(true);
    expect(canDecideOffer(ResourceOfferStatus.Accepted)).toBe(false);
    expect(canDecideOffer(ResourceOfferStatus.Declined)).toBe(false);
    expect(canDecideOffer(ResourceOfferStatus.Cancelled)).toBe(false);
  });
});

describe('canTransitionDelivery (M09)', () => {
  it('scheduled → completed is legal', () => {
    expect(
      canTransitionDelivery(ResourceDeliveryStatus.Scheduled, ResourceDeliveryStatus.Completed),
    ).toBe(true);
  });

  it('scheduled → cancelled is legal', () => {
    expect(
      canTransitionDelivery(ResourceDeliveryStatus.Scheduled, ResourceDeliveryStatus.Cancelled),
    ).toBe(true);
  });

  it('completed/cancelled are terminal — no further transition, not even a repeat', () => {
    expect(
      canTransitionDelivery(ResourceDeliveryStatus.Completed, ResourceDeliveryStatus.Completed),
    ).toBe(false);
    expect(
      canTransitionDelivery(ResourceDeliveryStatus.Cancelled, ResourceDeliveryStatus.Cancelled),
    ).toBe(false);
    expect(
      canTransitionDelivery(ResourceDeliveryStatus.Completed, ResourceDeliveryStatus.Cancelled),
    ).toBe(false);
  });
});
