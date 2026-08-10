import { describe, expect, it } from 'vitest';
import { formatLongDateEs, greetingLabel } from './greeting';

describe('greetingLabel', () => {
  it('greets "Buenos días" before noon', () => {
    expect(greetingLabel(new Date(2026, 6, 12, 8, 0))).toBe('Buenos días');
  });

  it('greets "Buenas tardes" from noon to before 7pm', () => {
    expect(greetingLabel(new Date(2026, 6, 12, 14, 0))).toBe('Buenas tardes');
  });

  it('greets "Buenas noches" from 7pm', () => {
    expect(greetingLabel(new Date(2026, 6, 12, 20, 0))).toBe('Buenas noches');
  });
});

describe('formatLongDateEs', () => {
  it('formats a long es-CO date', () => {
    // 2026-07-12 is a Sunday.
    expect(formatLongDateEs(new Date(2026, 6, 12))).toBe('domingo, 12 de julio de 2026');
  });
});
