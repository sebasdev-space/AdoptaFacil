import { describe, expect, it } from 'vitest';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { PORTAL_SECTION_BLUEPRINT, buildPortalView } from './portal-view';

const ORG: OrganizationPublic = { id: 'org-1', name: 'Refugio Patitas', slug: 'patitas' };

describe('buildPortalView', () => {
  it('wraps the public projection without reprojecting it', () => {
    const view = buildPortalView(ORG);
    // Same reference: the profile inherits public fields by contract, no copy.
    expect(view.profile.organization).toBe(ORG);
  });

  it('starts every aggregated section as a placeholder with an integration point', () => {
    const view = buildPortalView(ORG);
    expect(view.sections).toHaveLength(PORTAL_SECTION_BLUEPRINT.length);
    expect(view.sections.map((s) => s.kind)).toEqual([
      'pets',
      'activeCampaign',
      'needsToday',
      'transparency',
    ]);
    for (const section of view.sections) {
      expect(section.status).toBe('placeholder');
      expect(section.integrationPoint).toMatch(/pendiente/);
      expect(section.title.length).toBeGreaterThan(0);
    }
  });

  it('leaves the org-type slot empty until the contract exposes it', () => {
    expect(buildPortalView(ORG).profile.organizationType).toBeUndefined();
  });

  it('hydrates the org-type badge once the contract carries it', () => {
    // Forward-looking: when @sebastian adds `organizationType` to the public
    // projection, the portal picks it up by contract with no further changes.
    const typed = { ...ORG, organizationType: 'refugio' } as OrganizationPublic;
    expect(buildPortalView(typed).profile.organizationType).toBe('refugio');
  });
});
