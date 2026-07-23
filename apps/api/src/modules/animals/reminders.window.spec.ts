import { ReminderStatus } from '@adoptafacil/contracts';
import {
  REMINDER_MAX_ATTEMPTS,
  canResolve,
  classifyDue,
  isDue,
  reminderBackoffMs,
  reminderIdempotencyKey,
  statusForResolution,
} from './reminders.window';

const NOW = new Date('2026-07-23T00:00:00.000Z');
const day = 24 * 60 * 60 * 1000;

describe('reminders window (RF09)', () => {
  describe('classifyDue', () => {
    it('overdue when the due date is in the past', () => {
      expect(classifyDue(new Date(NOW.getTime() - day), NOW, 30)).toBe('overdue');
    });
    it('upcoming when within the window', () => {
      expect(classifyDue(new Date(NOW.getTime() + 10 * day), NOW, 30)).toBe('upcoming');
    });
    it('not_applicable beyond the window', () => {
      expect(classifyDue(new Date(NOW.getTime() + 100 * day), NOW, 30)).toBe('not_applicable');
    });
    it('not_applicable when there is no due date', () => {
      expect(classifyDue(null, NOW, 30)).toBe('not_applicable');
      expect(classifyDue(undefined, NOW, 30)).toBe('not_applicable');
    });
  });

  describe('isDue', () => {
    it('is true for overdue and upcoming, false otherwise', () => {
      expect(isDue(new Date(NOW.getTime() - day), NOW, 30)).toBe(true);
      expect(isDue(new Date(NOW.getTime() + day), NOW, 30)).toBe(true);
      expect(isDue(new Date(NOW.getTime() + 100 * day), NOW, 30)).toBe(false);
      expect(isDue(null, NOW, 30)).toBe(false);
    });
  });

  describe('reminderIdempotencyKey', () => {
    it('is stable for the same event/date/type and differs otherwise', () => {
      const d = new Date('2027-01-01T00:00:00.000Z');
      const k1 = reminderIdempotencyKey('e1', d, 'vaccine');
      const k2 = reminderIdempotencyKey('e1', new Date('2027-01-01T00:00:00.000Z'), 'vaccine');
      expect(k1).toBe(k2);
      expect(reminderIdempotencyKey('e2', d, 'vaccine')).not.toBe(k1);
      expect(reminderIdempotencyKey('e1', d, 'treatment')).not.toBe(k1);
    });
  });

  describe('reminderBackoffMs (RNF07: 5min/30min/2h/24h)', () => {
    it('follows the staggered schedule and clamps to the last delay', () => {
      expect(reminderBackoffMs(1)).toBe(5 * 60_000);
      expect(reminderBackoffMs(2)).toBe(30 * 60_000);
      expect(reminderBackoffMs(3)).toBe(2 * 60 * 60_000);
      expect(reminderBackoffMs(4)).toBe(24 * 60 * 60_000);
      expect(reminderBackoffMs(9)).toBe(24 * 60 * 60_000);
    });
    it('allows 1 initial attempt + the 4 staggered retries', () => {
      expect(REMINDER_MAX_ATTEMPTS).toBe(5);
    });
  });

  describe('state transitions', () => {
    it('maps resolution verbs to terminal statuses', () => {
      expect(statusForResolution('acknowledge')).toBe(ReminderStatus.Acknowledged);
      expect(statusForResolution('dismiss')).toBe(ReminderStatus.Dismissed);
    });
    it('allows resolving only non-terminal reminders', () => {
      expect(canResolve(ReminderStatus.Pending)).toBe(true);
      expect(canResolve(ReminderStatus.Sent)).toBe(true);
      expect(canResolve(ReminderStatus.Failed)).toBe(true);
      expect(canResolve(ReminderStatus.Acknowledged)).toBe(false);
      expect(canResolve(ReminderStatus.Dismissed)).toBe(false);
    });
  });
});
