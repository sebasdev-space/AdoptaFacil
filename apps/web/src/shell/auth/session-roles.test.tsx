import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, MockAuthApi, Role } from '../api';
import { SessionProvider, useSession } from './session-context';

/**
 * T-025 — RBAC roles in the session. Verifies the design decision (rooted in the
 * base document, §13, deny-by-default):
 *   - roles load WITHIN establishment (single round-trip), gated behind 'loading';
 *   - a roles-fetch failure keeps the session authenticated but with NO authority
 *     (roles: []), surfaces a 'degraded' state, and retries without re-login;
 *   - the role helpers deny by default (absent role / empty roles → false);
 *   - no browser storage is ever touched.
 */
function RolesConsumer() {
  const { status, rolesStatus, user, signIn, retryRoles, hasRole, hasAnyRole } = useSession();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="roles-status">{rolesStatus}</p>
      <p data-testid="roles">{user?.roles.join(',') || '—'}</p>
      <p data-testid="has-owner">{String(hasRole(Role.Owner))}</p>
      <p data-testid="has-admin">{String(hasRole(Role.Administrator))}</p>
      <p data-testid="has-any-op-vet">{String(hasAnyRole(Role.Operator, Role.Veterinarian))}</p>
      <button onClick={() => void signIn()}>signin</button>
      <button onClick={() => void retryRoles()}>retry</button>
    </div>
  );
}

describe('T-025 · roles loaded within session establishment', () => {
  let setItem: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setItem = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('populates real roles from /rbac/my-roles on success (single round-trip)', async () => {
    const authApi = new MockAuthApi({ roles: [Role.Owner, Role.Operator] });
    const rolesSpy = vi.spyOn(authApi, 'myRoles');
    const user = userEvent.setup();

    render(
      <SessionProvider authApi={authApi}>
        <RolesConsumer />
      </SessionProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'signin' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('roles-status')).toHaveTextContent('ready');
    expect(screen.getByTestId('roles')).toHaveTextContent('owner,operator');
    // Exactly one fetch, at establishment — not per navigation.
    expect(rolesSpy).toHaveBeenCalledTimes(1);

    // Gating uses the contract enum; present → allow, absent → deny.
    expect(screen.getByTestId('has-owner')).toHaveTextContent('true');
    expect(screen.getByTestId('has-admin')).toHaveTextContent('false');
    expect(screen.getByTestId('has-any-op-vet')).toHaveTextContent('true');

    // Non-negotiable: roles never touch browser storage.
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('stays authenticated with NO authority when the roles fetch fails, then retries without re-login', async () => {
    const authApi = new MockAuthApi({ roles: [Role.Owner] });
    // Fail the first roles fetch only; the retry falls through to the real mock.
    const rolesSpy = vi
      .spyOn(authApi, 'myRoles')
      .mockRejectedValueOnce(new ApiError(500, 'rbac_unavailable', 'boom'));
    const user = userEvent.setup();

    render(
      <SessionProvider authApi={authApi}>
        <RolesConsumer />
      </SessionProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'signin' }));

    // Authenticated despite the failure — but degraded and with zero authority.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('roles-status')).toHaveTextContent('degraded');
    expect(screen.getByTestId('roles')).toHaveTextContent('—');
    expect(screen.getByTestId('has-owner')).toHaveTextContent('false');

    // Retry (no re-login): the session was never torn down.
    await user.click(screen.getByRole('button', { name: 'retry' }));

    await waitFor(() => expect(screen.getByTestId('roles-status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('roles')).toHaveTextContent('owner');
    expect(screen.getByTestId('has-owner')).toHaveTextContent('true');
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(rolesSpy).toHaveBeenCalledTimes(2);

    // Still no browser storage across failure + retry.
    expect(setItem).not.toHaveBeenCalled();
  });

  it('denies by default when the user holds no roles', async () => {
    const authApi = new MockAuthApi({ roles: [] });
    const user = userEvent.setup();

    render(
      <SessionProvider authApi={authApi}>
        <RolesConsumer />
      </SessionProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'signin' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(screen.getByTestId('roles-status')).toHaveTextContent('ready');
    expect(screen.getByTestId('roles')).toHaveTextContent('—');
    // Empty roles → every check denies.
    expect(screen.getByTestId('has-owner')).toHaveTextContent('false');
    expect(screen.getByTestId('has-admin')).toHaveTextContent('false');
    expect(screen.getByTestId('has-any-op-vet')).toHaveTextContent('false');
  });
});
