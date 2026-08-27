import { describe, expect, it } from 'vitest';
import {
  SponsorshipPaymentStatus,
  SponsorshipPeriodicity,
  SponsorshipStatus,
  type Sponsorship,
  type SponsorshipPlan,
} from '@adoptafacil/contracts';
import {
  computeSponsorshipMetrics,
  isBillingFailureSuspension,
  isPaymentAtRisk,
  sponsorDisplayName,
} from './sponsorships-view';

function sponsorship(over: Partial<Sponsorship> = {}): Sponsorship {
  return {
    id: 's-1',
    organizationId: 'org-1',
    planId: 'plan-1',
    animalId: 'animal-1',
    sponsorUserId: 'padrino-11111111',
    status: SponsorshipStatus.Active,
    startedAt: '2026-07-28T21:25:22.299Z',
    createdAt: '2026-07-28T21:25:22.299Z',
    ...over,
  };
}

function plan(over: Partial<SponsorshipPlan> = {}): SponsorshipPlan {
  return {
    id: 'plan-1',
    organizationId: 'org-1',
    animalId: 'animal-1',
    name: 'Padrinazgo mensual',
    amount: 30_000,
    periodicity: SponsorshipPeriodicity.Monthly,
    isActive: true,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

describe('sponsorDisplayName (T-057)', () => {
  it('uses the snapshotted sponsorName when present', () => {
    expect(sponsorDisplayName(sponsorship({ sponsorName: 'Camila Torres' }))).toBe('Camila Torres');
  });

  it('falls back to a short, honest id — never fabricates a name — for pre-T-057 rows', () => {
    expect(sponsorDisplayName(sponsorship({ sponsorUserId: 'padrino-11111111' }))).toBe(
      'Padrino padrino-',
    );
  });
});

describe('computeSponsorshipMetrics (T-DASH-APADRINAMIENTOS)', () => {
  it('counts only ACTIVE sponsorships toward padrinos/ingreso/animales', () => {
    const rows = [
      sponsorship({ id: 's-1', sponsorUserId: 'p1', animalId: 'a1', planId: 'plan-1' }),
      sponsorship({
        id: 's-2',
        sponsorUserId: 'p2',
        animalId: 'a2',
        planId: 'plan-2',
        status: SponsorshipStatus.Suspended,
      }),
      sponsorship({
        id: 's-3',
        sponsorUserId: 'p3',
        animalId: 'a3',
        planId: 'plan-1',
        status: SponsorshipStatus.Cancelled,
      }),
    ];
    const plansById = new Map([
      ['plan-1', plan({ id: 'plan-1', amount: 30_000 })],
      ['plan-2', plan({ id: 'plan-2', amount: 40_000 })],
    ]);
    const metrics = computeSponsorshipMetrics(rows, plansById, 12);
    expect(metrics.activePadrinosCount).toBe(1);
    expect(metrics.monthlyIncomeTotal).toBe(30_000); // only s-1 (active)
    expect(metrics.animalsSponsoredCount).toBe(1);
    expect(metrics.animalsTotalCount).toBe(12);
  });

  it('deduplicates a padrino/animal sponsoring more than once', () => {
    const rows = [
      sponsorship({ id: 's-1', sponsorUserId: 'p1', animalId: 'a1', planId: 'plan-1' }),
      sponsorship({ id: 's-2', sponsorUserId: 'p1', animalId: 'a1', planId: 'plan-1' }),
    ];
    const plansById = new Map([['plan-1', plan({ amount: 30_000 })]]);
    const metrics = computeSponsorshipMetrics(rows, plansById, 5);
    expect(metrics.activePadrinosCount).toBe(1);
    expect(metrics.animalsSponsoredCount).toBe(1);
    expect(metrics.monthlyIncomeTotal).toBe(60_000); // still sums both sponsorship rows
  });

  it('returns all zeros when there are no sponsorships', () => {
    expect(computeSponsorshipMetrics([], new Map(), 8)).toEqual({
      activePadrinosCount: 0,
      monthlyIncomeTotal: 0,
      animalsSponsoredCount: 0,
      animalsTotalCount: 8,
      atRiskCount: 0,
    });
  });

  it('counts atRiskCount only for pending periods with 2+ attempts already used (S-5-REDISEÑO)', () => {
    const rows = [
      sponsorship({ id: 's-1' }), // no period yet — not at risk
      sponsorship({
        id: 's-2',
        currentPeriodStatus: SponsorshipPaymentStatus.Pending,
        currentPeriodAttemptCount: 1,
      }), // first attempt only — normal billing, not "at risk" yet
      sponsorship({
        id: 's-3',
        currentPeriodStatus: SponsorshipPaymentStatus.Pending,
        currentPeriodAttemptCount: 2,
      }),
      sponsorship({
        id: 's-4',
        currentPeriodStatus: SponsorshipPaymentStatus.Paid,
        currentPeriodAttemptCount: 3,
      }), // resolved (paid) — not at risk regardless of attempt count
    ];
    expect(computeSponsorshipMetrics(rows, new Map(), 4).atRiskCount).toBe(1);
  });
});

describe('isPaymentAtRisk (S-5-REDISEÑO Objetivo 7)', () => {
  it('is false with no open period', () => {
    expect(isPaymentAtRisk(sponsorship())).toBe(false);
  });

  it('is false on the first attempt (normal billing, not yet a risk signal)', () => {
    expect(
      isPaymentAtRisk(
        sponsorship({
          currentPeriodStatus: SponsorshipPaymentStatus.Pending,
          currentPeriodAttemptCount: 1,
        }),
      ),
    ).toBe(false);
  });

  it('is true from the 2nd attempt onward while still pending', () => {
    expect(
      isPaymentAtRisk(
        sponsorship({
          currentPeriodStatus: SponsorshipPaymentStatus.Pending,
          currentPeriodAttemptCount: 2,
        }),
      ),
    ).toBe(true);
  });

  it('is false once the period is resolved (paid or failed)', () => {
    expect(
      isPaymentAtRisk(
        sponsorship({
          currentPeriodStatus: SponsorshipPaymentStatus.Paid,
          currentPeriodAttemptCount: 3,
        }),
      ),
    ).toBe(false);
  });
});

describe('isBillingFailureSuspension (S-5-REDISEÑO Objetivo 6)', () => {
  it('is true when suspended with a failed period', () => {
    expect(
      isBillingFailureSuspension(
        sponsorship({
          status: SponsorshipStatus.Suspended,
          currentPeriodStatus: SponsorshipPaymentStatus.Failed,
        }),
      ),
    ).toBe(true);
  });

  it('is false for a manual suspension (no failed period)', () => {
    expect(isBillingFailureSuspension(sponsorship({ status: SponsorshipStatus.Suspended }))).toBe(
      false,
    );
  });

  it('is false when active, even with a failed period on record', () => {
    expect(
      isBillingFailureSuspension(
        sponsorship({
          status: SponsorshipStatus.Active,
          currentPeriodStatus: SponsorshipPaymentStatus.Failed,
        }),
      ),
    ).toBe(false);
  });
});
