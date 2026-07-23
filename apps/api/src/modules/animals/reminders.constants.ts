/** BullMQ queue + job names for the clinical-reminders worker (RF09). The queue
 *  runs on the reusable global BullMQ↔Redis connection (QueueModule). */
export const REMINDERS_QUEUE = 'clinical-reminders';
export const REMINDER_SCAN_JOB = 'scan';
export const REMINDER_SEND_JOB = 'send';

/** Payload for a per-reminder send job. */
export interface ReminderSendJobData {
  reminderId: string;
  organizationId: string;
}
