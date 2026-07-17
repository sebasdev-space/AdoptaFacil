import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from './app-providers';
import { AppRoutes } from './router/routes';

/**
 * Application shell entry point: providers + router + routes. Mounted by main.tsx.
 * The provider tree is router-agnostic; tests mount <AppProviders> + <AppRoutes>
 * under a <MemoryRouter> instead of <BrowserRouter>.
 */
export function Shell() {
  return (
    <AppProviders>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
