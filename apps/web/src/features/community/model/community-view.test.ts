import { describe, expect, it } from 'vitest';
import { commentCountLabel, excerpt, likeCountLabel, postDetailHref } from './community-view';

describe('community-view (M11)', () => {
  it('pluralizes comment counts, es-CO', () => {
    expect(commentCountLabel(0)).toBe('0 comentarios');
    expect(commentCountLabel(1)).toBe('1 comentario');
    expect(commentCountLabel(5)).toBe('5 comentarios');
  });

  it('never pluralizes "me gusta"', () => {
    expect(likeCountLabel(0)).toBe('0 me gusta');
    expect(likeCountLabel(1)).toBe('1 me gusta');
    expect(likeCountLabel(5)).toBe('5 me gusta');
  });

  it('builds the post detail href', () => {
    expect(postDetailHref('abc')).toBe('/comunidad/abc');
  });

  it('leaves a short body untouched', () => {
    expect(excerpt('Hola mundo')).toBe('Hola mundo');
  });

  it('truncates a long body with an ellipsis', () => {
    const body = 'x'.repeat(300);
    const result = excerpt(body, 220);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBe(221);
  });
});
