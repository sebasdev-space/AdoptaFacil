// M05 · Donations (T-050, P1) — public feature surface.
export { DonatePage } from './pages/donate-page';
export { DonateForm, type DonateFormValues } from './components/donate-form';
export { DonationBreakdown } from './components/donation-breakdown';
export {
  buildDonationBreakdown,
  safeBuildDonationBreakdown,
  formatCop,
  type BreakdownLine,
} from './model/donation-breakdown-view';
export {
  createDonation,
  listReceivedDonations,
  listMyDonations,
  getMyDonationReceipt,
} from './api/donations-api';
