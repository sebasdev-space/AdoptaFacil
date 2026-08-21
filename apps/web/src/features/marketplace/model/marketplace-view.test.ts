import { describe, expect, it } from 'vitest';
import {
  buildWhatsappUrl,
  contactMessage,
  formatCop,
  manageProductHref,
  publicProductHref,
  stockLabel,
} from './marketplace-view';

describe('marketplace-view (M10)', () => {
  it('formats integer COP pesos, es-CO', () => {
    expect(formatCop(85000)).toContain('85');
    expect(formatCop(85000)).toContain('$');
  });

  it('describes stock: zero, one, many', () => {
    expect(stockLabel(0)).toBe('Sin stock');
    expect(stockLabel(1)).toBe('1 disponible');
    expect(stockLabel(12)).toBe('12 disponibles');
  });

  it('builds public/manage hrefs', () => {
    expect(publicProductHref('abc')).toBe('/marketplace/abc');
    expect(manageProductHref('abc')).toBe('/organizacion/marketplace/abc');
  });

  it('builds a wa.me link, stripping non-digit characters', () => {
    const url = buildWhatsappUrl('+57 300 123 4567', 'Hola');
    expect(url).toBe('https://wa.me/573001234567?text=Hola');
  });

  it('returns null when the organization has no usable WhatsApp number', () => {
    expect(buildWhatsappUrl(undefined, 'Hola')).toBeNull();
    expect(buildWhatsappUrl('', 'Hola')).toBeNull();
    expect(buildWhatsappUrl('sin número', 'Hola')).toBeNull();
  });

  it('builds a contact message mentioning the product and the org', () => {
    const msg = contactMessage('Concentrado Premium', 'Refugio Patitas');
    expect(msg).toContain('Concentrado Premium');
    expect(msg).toContain('Refugio Patitas');
  });
});
