// M05 · Donations (T-050, P1) — public feature surface.
export { DonatePage } from './pages/donate-page';
export { ReceivedDonationsPage } from './pages/received-donations-page';
export { DonateForm, type DonateFormValues } from './components/donate-form';
export { DonationBreakdown } from './components/donation-breakdown';
export { MyDonationsList } from './components/my-donations-list';
export {
  buildDonationBreakdown,
  breakdownLines,
  safeBuildDonationBreakdown,
  formatCop,
  formatBogota,
  type BreakdownLine,
} from './model/donation-breakdown-view';
export {
  DONATION_STATUS_LABELS,
  DONATION_STATUS_BADGE_VARIANT,
  normalizeDonations,
  organizationLabel,
} from './model/my-donations-view';
export {
  donationConceptLabel,
  normalizeReceivedDonations,
  receivedDonorLabel,
} from './model/received-donations-view';
export {
  createDonation,
  listReceivedDonations,
  listMyDonations,
  getMyDonationReceipt,
} from './api/donations-api';
