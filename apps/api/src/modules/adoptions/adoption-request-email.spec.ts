import {
  buildAdoptionRequestsLink,
  buildAdoptionStatusEmailBody,
  buildAdoptionStatusEmailSubject,
} from './adoption-request-email';

describe('buildAdoptionRequestsLink (F-CORREO-ADOPCION)', () => {
  it('builds {base}/mis-solicitudes from WEB_BASE_URL', () => {
    expect(buildAdoptionRequestsLink('http://localhost:5173')).toBe(
      'http://localhost:5173/mis-solicitudes',
    );
  });

  it('trims a trailing slash on the base URL (no double slash)', () => {
    expect(buildAdoptionRequestsLink('https://app.adoptafacil.co/')).toBe(
      'https://app.adoptafacil.co/mis-solicitudes',
    );
  });

  it('never falls back to localhost when a real env base URL is given', () => {
    const link = buildAdoptionRequestsLink('https://app.adoptafacil.co');
    expect(link).not.toContain('localhost');
  });
});

describe('buildAdoptionStatusEmailSubject/Body (F-CORREO-ADOPCION)', () => {
  const base = {
    applicantName: 'Camilo Torres',
    animalName: 'Firulais',
    status: 'approved' as const,
    webBaseUrl: 'https://app.adoptafacil.co',
  };

  it('subject includes the animal name and the Spanish status label (same wording as "Mis solicitudes")', () => {
    expect(buildAdoptionStatusEmailSubject(base)).toBe(
      'Tu solicitud de adopción de Firulais: Aprobada',
    );
  });

  it('never renders the raw English status literal', () => {
    for (const status of ['new', 'in_review', 'approved', 'rejected'] as const) {
      const subject = buildAdoptionStatusEmailSubject({ ...base, status });
      const body = buildAdoptionStatusEmailBody({ ...base, status });
      expect(subject).not.toMatch(/\b(new|in_review|approved|rejected)\b/);
      expect(body).not.toMatch(/\b(new|in_review|approved|rejected)\b/);
    }
  });

  it('body greets the applicant by name and includes the organization when available', () => {
    const body = buildAdoptionStatusEmailBody({ ...base, organizationName: 'Refugio Patitas' });
    expect(body).toContain('Hola Camilo Torres,');
    expect(body).toContain('Firulais en Refugio Patitas');
    expect(body).toContain('Aprobada');
  });

  it('body omits the organization clause gracefully when the name is not available (never fabricated)', () => {
    const body = buildAdoptionStatusEmailBody(base);
    expect(body).toContain('Firulais cambió');
    expect(body).not.toContain('undefined');
  });

  it('body includes a real, clickable link to the public web base URL — never localhost', () => {
    const body = buildAdoptionStatusEmailBody(base);
    expect(body).toContain('https://app.adoptafacil.co/mis-solicitudes');
    expect(body).not.toContain('localhost');
  });
});
