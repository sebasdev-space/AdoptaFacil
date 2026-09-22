/**
 * DI token for the IdentityPort (T-Google-SignIn). The PORT INTERFACE, the
 * `IdentityClaims` shape and the `FakeIdentityAdapter` are published in
 * `@adoptafacil/contracts` (identity.ts) — imported, never copied. This file
 * only owns the injection SYMBOL, mirroring `payment.port.ts`: `AuthService`
 * injects the port by this SAME token, and the real Google adapter (this
 * directory) is swapped in ONE place (IdentityModule) without touching
 * AuthService.
 *
 * Consumer: `@Inject(IDENTITY_PORT) private readonly identity: IdentityPort`
 * where `IdentityPort` is the type imported from `@adoptafacil/contracts`.
 */
export const IDENTITY_PORT = Symbol('IDENTITY_PORT');
