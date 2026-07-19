import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from './app-providers';
import { AppRoutes } from './router/routes';

/**
 * Auth transport for the real app: 'http' talks to the backend `/auth/*`
 * endpoints (T-024). Set `VITE_AUTH_MODE=mock` to fall back to the in-memory
 * service (e.g. a backend-less demo). Tests never mount <Shell>, so they keep
 * the API layer's mock default.
 */
const AUTH_MODE: 'mock' | 'http' = import.meta.env.VITE_AUTH_MODE === 'mock' ? 'mock' : 'http';

/**
 * Application shell entry point: providers + router + routes. Mounted by main.tsx.
 * The provider tree is router-agnostic; tests mount <AppProviders> + <AppRoutes>
 * under a <MemoryRouter> instead of <BrowserRouter>.
 */
export function Shell() {
  return (
    <AppProviders session={{ mode: AUTH_MODE }}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
