/** Time-of-day salutation (es-CO) — pure so it's testable with a fixed `Date`. */
export function greetingLabel(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Long-form date, e.g. "sábado, 12 de julio de 2026". */
export function formatLongDateEs(date: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
