// Typed API layer of the app shell (T-022).
export { ApiError, toApiError } from './api-error';
export {
  ApiClient,
  type ApiClientConfig,
  type RequestOptions,
  type RefreshTokensFn,
} from './api-client';
export {
  InMemoryTokenStore,
  tokensFromContract,
  type TokenStore,
  type SessionTokens,
} from './token-store';
export { type AuthApi, HttpAuthApi, requestRefresh, type HttpAuthApiConfig } from './auth-api';
export { MockAuthApi, type MockAuthApiOptions } from './mock-auth-api';
export {
  createShellApi,
  DEFAULT_BASE_URL,
  type ShellApi,
  type CreateShellApiConfig,
} from './create-shell-api';
export { ApiClientProvider, useApiClient, type ApiClientProviderProps } from './api-context';

// Auth contract (local mock — swap for @adoptafacil/contracts when published).
export type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  AuthTokens,
  AuthUser,
} from './auth-contract';
