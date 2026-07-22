# Registro de contratos (vivo)

Fuente de verdad de las interfaces compartidas en [`packages/contracts`](../packages/contracts).
Cada dueño mantiene la fila de su módulo. Un contrato pasa a **Publicado** cuando
otro paquete lo consume; a partir de ahí, cambiar su forma es un cambio coordinado.

## Convención de estado

- **Stub** — archivo creado, interfaz vacía (`// TODO`). Aún no consumible.
- **Publicado** — interfaz estable y consumida; cambios rompientes requieren aviso.
- **Deprecado** — se retirará; no usar en código nuevo.

## Contratos compartidos

| Contrato       | Archivo         | Dueño             | Estado    | PR    | Notas                                               |
| -------------- | --------------- | ----------------- | --------- | ----- | --------------------------------------------------- |
| `HealthStatus` | `src/shared.ts` | bootstrap (T-000) | Publicado | T-000 | Respuesta de `GET /health`; consumido por api y web |

## Contratos core estables (base de la Ola 1)

Estos son los contratos del núcleo (multi-tenant, auth, RBAC y auditoría) sobre
los que arranca la Ola 1. **Publicados y estables**: cambiar su forma es un
cambio coordinado (avisar a los consumidores, incl. Fabián).

| Contrato                                                                                                         | Archivo        | Dueño             | Estado    | PR / Tarea | Notas                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | -------------- | ----------------- | --------- | ---------- | ------------------------------------------------------------------------------------ |
| `Organization`, `TenantContext`, `OrgMember`                                                                     | `src/org.ts`   | @sebastian (core) | Publicado | T-010      | Ancla de tenant + contexto por request; RLS efectiva (RNF03)                         |
| `AccountType`, `Register*Dto`, `LoginDto`, `AuthTokens`, `AuthSession`, `AuthenticatedUser`, `AccessTokenClaims` | `src/auth.ts`  | @sebastian (core) | Publicado | T-011 (#7) | Registro/login, JWT + refresh con rotación; consumido por pantallas de auth (T-F04)  |
| `Role`, `ORG_ROLES`, `PLATFORM_ROLES`, `RoleAssignment`, `AssignRoleDto`                                         | `src/auth.ts`  | @sebastian (core) | Publicado | T-012 (#8) | RBAC §13; `@Roles`/`RolesGuard` reutilizables viven en `apps/api/src/core/rbac`      |
| `AuditEvent`, `AuditEventInput`                                                                                  | `src/audit.ts` | @sebastian (core) | Publicado | T-013      | Auditoría append-only inmutable (RNF04); `AuditService` en `apps/api/src/core/audit` |

> Nota de arquitectura: los **guards/decoradores** de RBAC (`@Roles`, `RolesGuard`)
> y el `AuditService`/`JwtAuthGuard` son piezas de NestJS y viven en `apps/api/src/core/**`
> (no en `contracts`, que es solo tipos y lo consume también la web). El paquete
> `@adoptafacil/contracts` publica únicamente los **tipos y enums** compartidos.

## Contratos por módulo (semilla T-000)

| Módulo       | Archivo               | Dueño      | Ola | Estado                                                               |
| ------------ | --------------------- | ---------- | --- | -------------------------------------------------------------------- |
| org          | `src/org.ts`          | @sebastian | 0   | Publicado (T-010/011/012, ver arriba)                                |
| animals      | `src/animals.ts`      | @sebastian | 0   | Stub                                                                 |
| campaigns    | `src/campaigns.ts`    | @sebastian | 0   | Stub                                                                 |
| sponsorships | `src/sponsorships.ts` | @sebastian | 0   | Stub                                                                 |
| volunteering | `src/volunteering.ts` | @sebastian | 0   | Stub                                                                 |
| reputation   | `src/reputation.ts`   | @sebastian | 0   | Stub                                                                 |
| dashboards   | `src/dashboards.ts`   | @sebastian | 0   | Stub                                                                 |
| adoptions    | `src/adoptions.ts`    | @fabian    | 0   | Stub                                                                 |
| portals      | `src/portals.ts`      | @fabian    | 1   | Publicado (T-026 PortalView; T-027 PortalTheme + PortalTransparency) |
| payments     | `src/payments.ts`     | @fabian    | 2   | Stub (PaymentPort real en Ola 2)                                     |
| donations    | `src/donations.ts`    | @fabian    | 0   | Stub                                                                 |
| resources    | `src/resources.ts`    | @fabian    | 0   | Stub                                                                 |
| marketplace  | `src/marketplace.ts`  | @fabian    | 0   | Stub                                                                 |
| community    | `src/community.ts`    | @fabian    | 0   | Stub                                                                 |

> Al publicar un contrato: cambia su estado a **Publicado**, anota el PR y avisa a
> los consumidores.
