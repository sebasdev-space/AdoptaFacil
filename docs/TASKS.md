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

| ID    | Título                                       | Módulo    | Ola | Dueño   | Estado      |
| ----- | -------------------------------------------- | --------- | --- | ------- | ----------- |
| T-000 | Bootstrap del monorepo (walking skeleton)    | infra     | 0   | lead    | En revisión |
| T-021 | Shell del portal (layout, routing, §M14)     | web/shell | 0   | @fabian | En revisión |
| T-022 | Cliente API tipado + sesión (refresh)        | web/shell | 0   | @fabian | En revisión |
| T-023 | Pantallas de auth (login/registro/recuperar) | M02       | 0   | @fabian | En curso    |
| T-024 | Integración auth real (bloqueada por T-011)  | M02       | 0   | @fabian | Backlog     |

> Añade una fila por tarea. Convierte fechas relativas a absolutas al registrar.

## Deuda de integración

- **T-024 · Integración auth real (bloqueada por T-011).** Hoy el frontend (T-022/T-023)
  funciona contra un mock local del contrato auth (`auth-contract.ts` y `mock-auth-api.ts` en
  `apps/web/src/shell/api`). Cuando @sebastian publique `packages/contracts/auth.ts` (T-011) y
  los endpoints `/auth/*` reales, hay que: (a) hacer el swap de una línea en `auth-contract.ts`
  a `export * from '@adoptafacil/contracts'`; (b) apuntar el cliente al backend real (modo
  `http` en `createShellApi`); (c) validar login/registro/refresh end-to-end. Bloqueada por
  T-011.
