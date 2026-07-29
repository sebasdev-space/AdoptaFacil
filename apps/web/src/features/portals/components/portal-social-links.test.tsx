import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PortalSocialLinks } from './portal-social-links';

describe('PortalSocialLinks (T-D02)', () => {
  it('renders only the social/contact fields that carry a real value', () => {
    render(
      <PortalSocialLinks
        organization={{
          socialLinks: {
            instagram: 'https://instagram.com/patitas',
            website: 'https://patitas.org',
          },
          whatsapp: '+57 300 000 0000',
          contactEmail: 'hola@patitas.org',
        }}
      />,
    );

    expect(screen.getByRole('link', { name: /Instagram/ })).toHaveAttribute(
      'href',
      'https://instagram.com/patitas',
    );
    expect(screen.getByRole('link', { name: /Sitio web/ })).toHaveAttribute(
      'href',
      'https://patitas.org',
    );
    // Facebook/TikTok were absent — never rendered as empty entries.
    expect(screen.queryByText('Facebook')).not.toBeInTheDocument();
    expect(screen.queryByText('TikTok')).not.toBeInTheDocument();

    const whatsapp = screen.getByRole('link', { name: /WhatsApp/ });
    expect(whatsapp).toHaveAttribute('href', 'https://wa.me/573000000000');
    expect(whatsapp).toHaveAttribute('target', '_blank');
    expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer');

    expect(screen.getByRole('link', { name: 'hola@patitas.org' })).toHaveAttribute(
      'href',
      'mailto:hola@patitas.org',
    );
  });

  it('renders nothing when the organization has no social/contact field at all', () => {
    const { container } = render(<PortalSocialLinks organization={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('external links use target=_blank rel=noopener noreferrer (never a tab-nabbing seam)', () => {
    render(
      <PortalSocialLinks
        organization={{ socialLinks: { facebook: 'https://facebook.com/patitas' } }}
      />,
    );
    const link = screen.getByRole('link', { name: /Facebook/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
