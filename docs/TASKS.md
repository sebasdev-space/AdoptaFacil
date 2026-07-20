# Tablero de tareas — convención `T-###`

Cada tarea tiene un identificador `T-###` correlativo, se asocia a un **módulo** y
a una **ola**, y tiene un dueño. El ID aparece en el título del PR y en el cuerpo
(plantilla de PR).

## Formato de una tarea

```
T-###  ·  <Título corto>
Módulo:   <org|animals|adoptions|...>       RF: <req funcional o N/A>
Ola:      <0|1|2|...>                        Dueño: @<usuario>
Estado:   Backlog | En curso | En revisión | Hecho
```

## Olas

- **Ola 0** — Fundación por dueño (core backend de @sebastian, shell/design system
  de @fabian) sobre este bootstrap.
- **Olas 1+** — Funcionalidades de módulos (M01–M15) según el documento base.

## Estados

| Estado      | Significado                                 |
| ----------- | ------------------------------------------- |
| Backlog     | Definida, sin empezar                       |
| En curso    | Rama abierta, en desarrollo                 |
| En revisión | PR abierto, esperando revisión cruzada + CI |
| Hecho       | Merge a `main` con CI en verde              |

## Registro

| ID     | Título                                         | Módulo    | Ola | Dueño      | Estado      |
| ------ | ---------------------------------------------- | --------- | --- | ---------- | ----------- |
| T-000  | Bootstrap del monorepo (walking skeleton)      | infra     | 0   | lead       | Hecho       |
| T-010  | Tenant context por request + RLS efectiva      | core      | 0   | @sebastian | Hecho       |
| T-011  | Auth: registro, login, JWT + refresh rotativo  | M02       | 0   | @sebastian | Hecho       |
| T-012  | RBAC: roles + matriz, guards por tenant        | M02       | 0   | @sebastian | Hecho       |
| T-012b | Otorgar rol Owner al registrar organización    | M02       | 0   | @sebastian | Hecho       |
| T-013  | Audit log append-only inmutable (RNF04)        | core      | 0   | @sebastian | Hecho       |
| T-014  | Automatizar `prisma generate` (postinstall)    | infra     | 0   | @sebastian | Backlog     |
| T-015  | Contracts como paquete compilado (`dist`)      | infra     | 0   | @sebastian | En revisión |
| T-016  | Contracts dual ESM+CJS (desbloquear web:build) | infra     | 0   | @sebastian | En revisión |
| T-020  | Design system (tokens + librería base)         | web/ui    | 0   | @fabian    | Hecho       |
| T-021  | Shell del portal (layout, routing, §M14)       | web/shell | 0   | @fabian    | Hecho       |
| T-022  | Cliente API tipado + sesión (refresh)          | web/shell | 0   | @fabian    | Hecho       |
| T-023  | Pantallas de auth (login/registro/recuperar)   | M02       | 0   | @fabian    | Hecho       |
| T-024  | Integración auth real (contra `/auth/*`)       | M02       | 0   | @fabian    | Hecho       |
| T-025  | Roles en frontend (consumir `/rbac/my-roles`)  | M02       | 1   | @fabian    | Backlog     |

> Añade una fila por tarea. Convierte fechas relativas a absolutas al registrar.
> Reconciliado con `origin/main` el 2026-07-20: PRs #1–#11 mergeados; sin PRs abiertos.

## Deuda de integración

- **T-024 · Integración auth real (contra `/auth/*`).** _Hecho._ Con T-011 (auth) y T-012
  (RBAC) ya en `main`, el frontend deja el mock y habla con el backend real. El "swap" resultó
  **más que una línea**: los nombres/formas del contrato real difieren del mock, así que
  `auth-contract.ts` re-exporta `@adoptafacil/contracts` **con alias de borde** y una unión de
  registro propia de la web. Cambios: (a) `HttpAuthApi` — split de registro en
  `/auth/register/organization` y `/auth/register/person`, `refresh` sin envoltura, ruta
  `/auth/password-reset` (202 sin cuerpo); (b) transporte `http` por defecto en el entry real
  (`Shell`, con escape `VITE_AUTH_MODE=mock`); (c) formularios alineados a los 4 campos reales
  del DTO. **Validado end-to-end contra la API real (2026-07-18):** registro org/persona (201),
  login (200), refresh sin envoltura (200, `AuthTokens` top-level), logout (204 + revocación),
  `/auth/me` (200). Sin desajustes cliente↔backend.
- **M01 (Ola 1) · Formalización de organización debe capturar el NIT (y opcionalmente el
  teléfono).** El registro (M02) pide solo el mínimo del DTO real
  (`organizationName, displayName, email, password`), por lo que **el NIT y el teléfono se
  retiraron de la pantalla de registro** (T-024). El NIT es un atributo estructural de la
  organización y pertenece al flujo de formalización de M01; hay que capturarlo (y persistirlo)
  ahí. Los validadores `validateNit`/`validateOptionalPhone` se eliminaron; recupéralos del
  historial de git si M01 los reutiliza.
- **T-025 · Roles en frontend (Ola 1).** _Hecho._ `AuthenticatedUser` no trae roles; el backend
  los expone en `GET /rbac/my-roles` (T-012). El shell ahora consume ese endpoint **dentro de
  `establish()`** (login/registro) y puebla `SessionUser.roles` con el enum `Role` del contrato
  (`@adoptafacil/contracts`), más helpers `hasRole`/`hasAnyRole` para gating de UI. Decisión de
  diseño (fundamentada en el documento base §13, **deny-by-default**): (a) **timing** — la carga
  de roles es un único round-trip en el establecimiento; la sesión no pasa a `authenticated`
  hasta que los roles resuelven (estado `loading` mientras tanto); (b) **error** — si
  `/rbac/my-roles` falla, la sesión queda **autenticada pero sin autoridad** (`roles: []`,
  `rolesStatus: 'degraded'`) con opción de **reintentar** sin re-login; nunca se asumen permisos
  ante un fallo. Sin browser storage (roles en memoria/contexto). Informado a @sebastian: la
  decisión de timing/error se tomó por el documento base (informativo, no negociable).

## Pendientes para @sebastian (detectados en T-024)

Reconciliados contra `origin/main` el 2026-07-20. T-024 (PR#11) es el commit más reciente;
ningún merge posterior los toca.

- **[INFRA · alta] La API no arranca con `node`/`nest start` planos bajo Node moderno.**
  _Resuelto (T-015)._ `@adoptafacil/contracts` ahora se **compila a `dist/`** (CommonJS +
  `.d.ts` + source/declaration maps vía `tsconfig.build.json`), con `main`/`types`/`exports`
  apuntando a `dist` y `files: ["dist"]`. CommonJS mantiene los imports internos sin extensión
  funcionando en runtime sin tocar el source. Un script `prepare` recompila `dist` en cada
  `pnpm install`, y el build del monorepo ya construye `contracts` antes que `api`
  (`turbo build dependsOn ^build`). Verificado: `pnpm install` → `pnpm --filter api dev`
  arranca (`/health` 200) sin ts-node ni parches, y el paquete resuelve tanto en **Node 20**
  como en **Node 21** (independiente de la versión). Al desenmascarar el arranque, aparece un
  bug preexistente de T-011 corregido en el mismo PR: `DATABASE_URL_APP` se añadió al esquema
  de `env.validation` (antes lo descartaba la validación y no llegaba a `process.env`, por lo
  que `PrismaService` fallaba).

- **[INFRA · alta] `pnpm turbo build` (web) roto por named export CJS.** _Resuelto (T-016)._
  T-025 (`0c1031e`) re-exporta el **valor** `Role` (`export { Role } from '@adoptafacil/contracts'`
  en `apps/web/.../auth-contract.ts`), pero contracts (T-015) compilaba **solo a CommonJS**; su
  `dist/index.js` re-exporta con `__exportStar`, que rollup (build de producción de Vite) no
  analiza estáticamente → `"Role" is not exported`. **Fix (T-016):** contracts ahora emite
  **dual ESM + CJS** con `exports` condicionales — `import` → `dist/esm` (ESM con `export *`
  estático, así rollup resuelve `Role`), `require` → `dist/cjs` (la api sigue arrancando en CJS
  como hoy), `types` por condición. `package.json` anidados (`{"type":"module"}` en `dist/esm`,
  `{"type":"commonjs"}` en `dist/cjs`) mantienen la clasificación correcta. Verificado en frío:
  `pnpm turbo run build` verde **incluyendo `@adoptafacil/web#build`**; `pnpm --filter api dev`
  arranca (`/health` 200, sin ts-node); barrido 14/14 + `test:rls`; resuelve en Node 20 y 21. Sin
  tocar `apps/web` ni la superficie pública del contrato.

- **[T-014 · media] `prisma generate` en postinstall.** _Parcial._ El CI ya genera el
  cliente (`ci.yml`, paso "Generate Prisma client", heredado de T-010/PR#2), así que CI está
  cubierto. Falta la parte de T-014: no hay hook `postinstall` (raíz ni `apps/api`; solo el
  script manual `db:generate`), por lo que en local sigue siendo manual. T-014 continúa en
  Backlog.

- **[/auth/me · media] `GET /auth/me` devuelve `displayName = email`.** _Vigente._
  `apps/api/src/core/auth/auth.controller.ts` degrada `displayName` al email porque el
  `RequestUser` del JWT no carga el nombre. Enriquecer `/auth/me` con el `displayName` real;
  asociar a T-025.

- **[T-025 / RBAC · baja] Contrato de `GET /rbac/my-roles`.** _Resuelto (lado web)._ Endpoint
  estable en `main` (`rbac.controller.ts`, `@Get('my-roles')` bajo `JwtAuthGuard`, devuelve
  `Role[]`), con cobertura de integración; enum `Role` estable en el contrato. El comportamiento
  de cliente ya quedó decidido e implementado en T-025 según el documento base (§13,
  deny-by-default): fetch dentro de `establish()` (bloquea el paso a `authenticated`) y, ante
  fallo, sesión autenticada sin autoridad + reintento. Comunicado a @sebastian como informativo.
