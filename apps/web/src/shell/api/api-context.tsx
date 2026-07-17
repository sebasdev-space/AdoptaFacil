import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from './api-client';

/**
 * Makes the typed {@link ApiClient} available to feature code via `useApiClient`.
 * The provider is rendered by the session layer (which owns the client's
 * lifecycle), so features get a client that already carries the refresh
 * interceptor and current session.
 */
const ApiClientContext = createContext<ApiClient | undefined>(undefined);

export interface ApiClientProviderProps {
  client: ApiClient;
  children: ReactNode;
}

export function ApiClientProvider({ client, children }: ApiClientProviderProps) {
  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

/** Access the shared API client. Throws if used outside the provider. */
export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (client === undefined) {
    throw new Error('useApiClient must be used within an <ApiClientProvider>');
  }
  return client;
}
