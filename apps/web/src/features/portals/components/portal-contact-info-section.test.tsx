import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PortalContactInfoSection } from './portal-contact-info-section';

describe('PortalContactInfoSection — mapa', () => {
  it('muestra el mapa embebido sin hacer clic cuando hay un enlace de Google Maps embebible', () => {
    render(
      <PortalContactInfoSection
        contact={{ mapUrl: 'https://www.google.com/maps/place/Refugio+Patitas/@4.6,-74.1,15z' }}
      />,
    );
    expect(screen.getByTestId('portal-contact-map')).toHaveAttribute(
      'src',
      'https://maps.google.com/maps?q=Refugio%20Patitas&output=embed',
    );
    expect(screen.getByRole('link', { name: /Abrir en Google Maps/ })).toBeInTheDocument();
  });

  it('con un enlace corto de "compartir" (no embebible) usa la dirección y deja el enlace aparte', () => {
    render(
      <PortalContactInfoSection
        contact={{
          mapUrl: 'https://maps.app.goo.gl/abc123',
          fullAddress: 'Cl. 58i Bis Sur # 78B-15',
        }}
        location={{ city: 'Bogotá', country: 'Colombia' }}
      />,
    );
    const src = screen.getByTestId('portal-contact-map').getAttribute('src') ?? '';
    expect(src).toContain('output=embed');
    expect(decodeURIComponent(src)).toContain('Cl. 58i Bis Sur # 78B-15, Bogotá, Colombia');
    expect(screen.getByRole('link', { name: /Abrir en Google Maps/ })).toHaveAttribute(
      'href',
      'https://maps.app.goo.gl/abc123',
    );
  });

  it('solo con dirección (sin enlace) también muestra el mapa', () => {
    render(<PortalContactInfoSection contact={{ fullAddress: 'Carrera 7 # 10-20' }} />);
    expect(screen.getByTestId('portal-contact-map')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('sin dirección ni enlace no muestra mapa', () => {
    render(<PortalContactInfoSection contact={{ hours: 'Lunes a viernes' }} />);
    expect(screen.queryByTestId('portal-contact-map')).not.toBeInTheDocument();
  });

  it('con un enlace corto y SIN dirección solo deja el enlace "Ver en mapa"', () => {
    render(<PortalContactInfoSection contact={{ mapUrl: 'https://maps.app.goo.gl/abc123' }} />);
    expect(screen.queryByTestId('portal-contact-map')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver en mapa →' })).toBeInTheDocument();
  });
});
