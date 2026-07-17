import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageLoading } from '../layout/layout-states';
import { useSession } from './session-context';

export interface RequireAuthProps {
  /**
   * Where to send unauthenticated visitors. Defaults to the shell's login route.
   */
  redirectTo?: string;
  /** Optional explicit children; defaults to an <Outlet /> for nested routes. */
  children?: ReactNode;
}

/**
 * Route guard for protected sections. Wrap protected routes with this element
 * (or nest routes beneath it). It reads the session from the shared context, so
 * swapping the mock session for the real one (T-022) needs no changes here.
 *
 *   - 'loading'        → layout-level loading state (session resolving)
 *   - 'unauthenticated'→ redirect to the login route, remembering the origin so
 *                        the user returns to it after signing in
 *   - 'authenticated'  → render the protected content
 */
export function RequireAuth({ redirectTo = '/login', children }: RequireAuthProps) {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return <FullPageLoading label="Verificando tu sesión…" />;
  }

  if (status === 'unauthenticated') {
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  return <>{children ?? <Outlet />}</>;
}
