// Session/auth layer of the app shell. Integration point for the real session (T-022).
export {
  SessionProvider,
  useSession,
  type SessionStatus,
  type RolesStatus,
  type SessionUser,
  type SessionContextValue,
  type SessionProviderProps,
} from './session-context';
export { RequireAuth, type RequireAuthProps } from './require-auth';
export { RequireRoles, type RequireRolesProps } from './require-roles';
