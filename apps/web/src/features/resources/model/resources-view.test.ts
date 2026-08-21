import { describe, expect, it } from 'vitest';
import {
  ResourceDeliveryStatus,
  ResourceNeedStatus,
  ResourceOfferStatus,
} from '@adoptafacil/contracts';
import {
  DELIVERY_STATUS_LABELS,
  needStatusVariant,
  offerStatusVariant,
  progressPercent,
  publicResourceNeedHref,
  manageResourceNeedHref,
  remainingQuantity,
} from './resources-view';

describe('progressPercent (M09)', () => {
  it('rounds 0..1 to an integer 0..100', () => {
    expect(progressPercent(0)).toBe(0);
    expect(progressPercent(0.4)).toBe(40);
    expect(progressPercent(1)).toBe(100);
  });

  it('clamps negative/NaN/over-1 values', () => {
    expect(progressPercent(-0.5)).toBe(0);
    expect(progressPercent(Number.NaN)).toBe(0);
    expect(progressPercent(1.5)).toBe(100);
  });
});

describe('remainingQuantity (M09)', () => {
  it('subtracts fulfilled from needed', () => {
    expect(remainingQuantity(20, 8)).toBe(12);
  });

  it('never goes negative even when over-fulfilled', () => {
    expect(remainingQuantity(20, 25)).toBe(0);
  });
});

describe('needStatusVariant (M09)', () => {
  it('maps fulfilled/cancelled to their semantic variants, everything else to secondary', () => {
    expect(needStatusVariant(ResourceNeedStatus.Fulfilled)).toBe('success');
    expect(needStatusVariant(ResourceNeedStatus.Cancelled)).toBe('destructive');
    expect(needStatusVariant(ResourceNeedStatus.Needed)).toBe('secondary');
    expect(needStatusVariant(ResourceNeedStatus.PartiallyFulfilled)).toBe('secondary');
  });
});

describe('offerStatusVariant (M09)', () => {
  it('maps accepted/declined/cancelled, offered stays secondary', () => {
    expect(offerStatusVariant(ResourceOfferStatus.Accepted)).toBe('success');
    expect(offerStatusVariant(ResourceOfferStatus.Declined)).toBe('destructive');
    expect(offerStatusVariant(ResourceOfferStatus.Cancelled)).toBe('destructive');
    expect(offerStatusVariant(ResourceOfferStatus.Offered)).toBe('secondary');
  });
});

describe('DELIVERY_STATUS_LABELS (M09)', () => {
  it('has a label for every enum value', () => {
    expect(DELIVERY_STATUS_LABELS[ResourceDeliveryStatus.Scheduled]).toBe('Programada');
    expect(DELIVERY_STATUS_LABELS[ResourceDeliveryStatus.Completed]).toBe('Completada');
    expect(DELIVERY_STATUS_LABELS[ResourceDeliveryStatus.Cancelled]).toBe('Cancelada');
  });
});

describe('link builders (M09)', () => {
  it('publicResourceNeedHref/manageResourceNeedHref encode the id', () => {
    expect(publicResourceNeedHref('abc 123')).toBe('/recursos/abc%20123');
    expect(manageResourceNeedHref('abc 123')).toBe('/organizacion/recursos/abc%20123');
  });
});
