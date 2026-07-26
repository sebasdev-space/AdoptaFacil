import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrganizationType } from '@adoptafacil/contracts';
import { OrgTypeBadge } from './org-type-badge';

/**
 * T-030 — org-type badge. Renders the human label when the type is present and,
 * deny-by-default, renders NOTHING when it is absent (never an empty/"undefined"
 * badge). Unknown values (forward-compat) fall back to the raw string.
 */
describe('OrgTypeBadge', () => {
  it('renders the human label when the type is present', () => {
    render(<OrgTypeBadge organizationType={OrganizationType.Shelter} />);
    expect(screen.getByTestId('org-type-badge')).toHaveTextContent('Refugio');
  });

  it('renders NOTHING when the type is absent (deny-by-default)', () => {
    const { container } = render(<OrgTypeBadge organizationType={undefined} />);
    expect(screen.queryByTestId('org-type-badge')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to the raw value for a type outside the enum (forward-compat)', () => {
    render(<OrgTypeBadge organizationType="cooperativa" />);
    expect(screen.getByTestId('org-type-badge')).toHaveTextContent('cooperativa');
  });
});
