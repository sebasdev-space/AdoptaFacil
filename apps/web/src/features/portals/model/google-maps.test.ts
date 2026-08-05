import { describe, expect, it } from 'vitest';
import { isGoogleMapsUrl, toGoogleMapsEmbedUrl } from './google-maps';

describe('isGoogleMapsUrl', () => {
  it('recognizes google.com/maps and maps.google.com URLs', () => {
    expect(isGoogleMapsUrl('https://www.google.com/maps/place/Bogota')).toBe(true);
    expect(isGoogleMapsUrl('https://maps.google.com/?q=Bogota')).toBe(true);
  });

  it('rejects non-Google-Maps URLs', () => {
    expect(isGoogleMapsUrl('https://www.openstreetmap.org/way/123')).toBe(false);
    expect(isGoogleMapsUrl('https://www.google.com/search?q=bogota')).toBe(false);
    expect(isGoogleMapsUrl('not a url')).toBe(false);
  });
});

describe('toGoogleMapsEmbedUrl (S2-REORG: fixes the "refused to connect" iframe)', () => {
  it('returns an already-embed URL unchanged', () => {
    const embed = 'https://maps.google.com/maps?q=Bogota&output=embed';
    expect(toGoogleMapsEmbedUrl(embed)).toBe(embed);
    const embedPath = 'https://www.google.com/maps/embed?pb=!1m18!blah';
    expect(toGoogleMapsEmbedUrl(embedPath)).toBe(embedPath);
  });

  it('converts a ?q= share URL to an embeddable one', () => {
    expect(toGoogleMapsEmbedUrl('https://maps.google.com/?q=Bogota,+Colombia')).toBe(
      'https://maps.google.com/maps?q=Bogota%2C%20Colombia&output=embed',
    );
  });

  it('converts a /maps/place/<name>/... URL by extracting the place name', () => {
    expect(
      toGoogleMapsEmbedUrl('https://www.google.com/maps/place/Refugio+Patitas/@4.6,-74.1,15z'),
    ).toBe('https://maps.google.com/maps?q=Refugio%20Patitas&output=embed');
  });

  it('returns null (no confident conversion) for a bare coordinates URL with no name/query', () => {
    expect(toGoogleMapsEmbedUrl('https://www.google.com/maps/@4.6,-74.1,15z')).toBeNull();
  });

  it('returns null for a non-Google-Maps URL — caller must fall back to a plain link', () => {
    expect(toGoogleMapsEmbedUrl('https://www.openstreetmap.org/way/123')).toBeNull();
  });

  it('returns null for an invalid URL', () => {
    expect(toGoogleMapsEmbedUrl('not a url')).toBeNull();
  });
});
