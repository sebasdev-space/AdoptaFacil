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

| ID    | Título                                         | Módulo    | Ola | Dueño      | Estado      |
| ----- | ---------------------------------------------- | --------- | --- | ---------- | ----------- |
| T-000 | Bootstrap del monorepo (walking skeleton)      | infra     | 0   | lead       | En revisión |
| T-021 | Shell del portal (layout, routing, §M14)       | web/shell | 0   | @fabian    | En revisión |
| T-022 | Cliente API tipado + sesión (refresh)          | web/shell | 0   | @fabian    | En revisión |
| T-023 | Pantallas de auth (login/registro/recuperar)   | M02       | 0   | @fabian    | Hecho       |
| T-024 | Integración auth real (contra `/auth/*`)       | M02       | 0   | @fabian    | En revisión |
| T-025 | Roles en frontend (consumir `/rbac/my-roles`)  | M02       | 1   | @fabian    | Backlog     |
| T-014 | Automatizar `prisma generate` (CI/postinstall) | infra     | 0   | @sebastian | Backlog     |

> Añade una fila por tarea. Convierte fechas relativas a absolutas al registrar.

## Deuda de integración

- **T-024 · Integración auth real (contra `/auth/*`).** _En curso._ Con T-011 (auth) y T-012
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
- **T-025 · Roles en frontend (Ola 1).** `AuthenticatedUser` no trae roles; el backend los
  expone en `GET /rbac/my-roles` (T-012). En T-024 `SessionUser.roles` queda como `[]` (stub);
  T-025 debe consumir ese endpoint tras login/registro y poblar los roles con el enum `Role`.
  A confirmar con @sebastian: timing del fetch y comportamiento ante fallo de `/rbac/my-roles`.

## Pendientes para @sebastian (detectados en T-024)

Surgieron al levantar el backend real y validar el humo end-to-end de T-024. Ninguno bloquea
el frontend de T-024 (ya validado en vivo), pero quedan rastreables para su dominio.

- **[INFRA · alta] La API no arranca con `node`/`nest start` planos bajo Node 24.**
  `@adoptafacil/contracts` se publica como **TypeScript crudo** (`main: ./src/index.ts`) con
  imports relativos **sin extensión** (`export * from './shared'`). Bajo Node 24 (ESM +
  type-stripping) eso falla con `ERR_MODULE_NOT_FOUND`; el `dist` compilado (`node dist/main.js`)
  falla igual por el `require('@adoptafacil/contracts')` del enum `Role`. En T-024 se sorteó
  arrancando la API con `ts-node` (compila ese TS con metadata de decoradores), pero es un
  parche local. Solución de fondo (a decidir por @sebastian/infra): compilar `contracts` a JS
  con `exports` a `dist`, o usar imports con extensión explícita, o fijar Node 20 LTS en el
  entorno de ejecución (el `.nvmrc` ya dice 20; falta hacerlo efectivo).

- **[T-014 · alta] Confirmar automatización de `prisma generate`.** Sin el cliente Prisma
  generado, el `typecheck`/arranque del `api` falla en local (hay que correr `prisma generate`
  a mano). Confirmar si T-014 ya lo automatiza (postinstall / paso de CI); mientras no esté en
  `main`, documentar el `generate` manual como prerrequisito.

- **[/auth/me · media] `GET /auth/me` devuelve `displayName = email`.** El `RequestUser` del JWT
  no carga el nombre, así que `me` degrada `displayName` al email. Hoy no afecta a T-024 (el
  `establish()` usa el `displayName` real del login), pero al rehidratar identidad vía `/auth/me`
  el nombre caería a email. Enriquecer `/auth/me` con el `displayName` real; asociar a T-025.

- **[T-025 / RBAC · media] Estabilidad y contrato de `GET /rbac/my-roles`.** Antes de cablear
  roles en el frontend (T-025), confirmar con @sebastian: (a) estabilidad del contrato del
  endpoint; (b) timing acordado (¿bloquea el render hasta tener roles, o hidrata después?);
  (c) manejo de error si `/rbac/my-roles` falla. El gating de UI migrará del string `'admin'`
  del mock al enum `Role` real del contrato.
