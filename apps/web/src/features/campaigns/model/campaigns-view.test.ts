import { describe, expect, it } from 'vitest';
import { parseOptionalEvidenceAmount } from './campaigns-view';

describe('parseOptionalEvidenceAmount — misma regla que el backend (entero positivo u opcional)', () => {
  it('devuelve undefined para un campo vacío (sin monto, válido)', () => {
    expect(parseOptionalEvidenceAmount('')).toBeUndefined();
    expect(parseOptionalEvidenceAmount('   ')).toBeUndefined();
  });

  it('devuelve el número para un entero positivo válido', () => {
    expect(parseOptionalEvidenceAmount('50000')).toBe(50000);
    expect(parseOptionalEvidenceAmount('1')).toBe(1);
  });

  it('devuelve null (inválido) para un decimal', () => {
    expect(parseOptionalEvidenceAmount('12.5')).toBeNull();
  });

  it('devuelve null (inválido) para cero o negativos', () => {
    expect(parseOptionalEvidenceAmount('0')).toBeNull();
    expect(parseOptionalEvidenceAmount('-5')).toBeNull();
  });

  it('devuelve null (inválido) para texto no numérico', () => {
    expect(parseOptionalEvidenceAmount('abc')).toBeNull();
  });
});
