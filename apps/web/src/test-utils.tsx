import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, type AppProvidersProps } from './shell/app-providers';
import { AppRoutes } from './shell/router/routes';

export interface RenderShellOptions {
  /** Initial route(s) for the MemoryRouter. Defaults to '/'. */
  route?: string;
  session?: AppProvidersProps['session'];
  transparency?: AppProvidersProps['transparency'];
}

/**
 * Renders the full shell (providers + routes) under a MemoryRouter so tests can
 * drive public vs protected routing and inspect the layout/indicator.
 */
export function renderShell({
  route = '/',
  session,
  transparency,
}: RenderShellOptions = {}): RenderResult {
  return render(
    <AppProviders session={session} transparency={transparency}>
      <MemoryRouter
        initialEntries={[route]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}
