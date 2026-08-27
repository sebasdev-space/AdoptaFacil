/** BullMQ queue + job names for the sponsorship recurring-billing worker
 *  (S-5-REDISEÑO, M07/RF17, T-057) — the FIRST real cron job in this project,
 *  same pattern as `clinical-reminders` (T-106): a repeatable job self-
 *  registered via `onModuleInit`, running on the shared global BullMQ↔Redis
 *  connection (QueueModule). */
export const SPONSORSHIP_BILLING_QUEUE = 'sponsorship-billing';
export const SPONSORSHIP_BILLING_SCAN_JOB = 'scan';
export const SPONSORSHIP_PAYMENT_POLL_JOB = 'poll';
