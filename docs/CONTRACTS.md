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

## Contratos por módulo (semilla T-000)

| Módulo       | Archivo               | Dueño      | Ola | Estado                           |
| ------------ | --------------------- | ---------- | --- | -------------------------------- |
| org          | `src/org.ts`          | @sebastian | 0   | Stub                             |
| animals      | `src/animals.ts`      | @sebastian | 0   | Stub                             |
| campaigns    | `src/campaigns.ts`    | @sebastian | 0   | Stub                             |
| sponsorships | `src/sponsorships.ts` | @sebastian | 0   | Stub                             |
| volunteering | `src/volunteering.ts` | @sebastian | 0   | Stub                             |
| reputation   | `src/reputation.ts`   | @sebastian | 0   | Stub                             |
| dashboards   | `src/dashboards.ts`   | @sebastian | 0   | Stub                             |
| adoptions    | `src/adoptions.ts`    | @fabian    | 0   | Stub                             |
| portals      | `src/portals.ts`      | @fabian    | 0   | Stub                             |
| payments     | `src/payments.ts`     | @fabian    | 2   | Stub (PaymentPort real en Ola 2) |
| donations    | `src/donations.ts`    | @fabian    | 0   | Stub                             |
| resources    | `src/resources.ts`    | @fabian    | 0   | Stub                             |
| marketplace  | `src/marketplace.ts`  | @fabian    | 0   | Stub                             |
| community    | `src/community.ts`    | @fabian    | 0   | Stub                             |

> Al publicar un contrato: cambia su estado a **Publicado**, anota el PR y avisa a
> los consumidores.
