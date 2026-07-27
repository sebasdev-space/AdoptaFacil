# AdoptaFácil V2.0 — Documento único de alineación

> **Propósito.** Corte de verdad único que reemplaza los resúmenes de chat previos. Estado, decisiones fundamentadas en el documento base, y pendientes. Perspectiva: **Fabián (Dev #2)**.
> **Corte:** 26 de julio de 2026 · `main` con Ola 2 en curso (hasta T-053). **Hito próximo:** pitch del 13 de agosto. **Meta:** entrega completa de las tres Olas.
> **Reemplaza a:** el corte del 24-jul y todos los resúmenes de chat anteriores.

---

## 0. Jerarquía de fuentes (no negociable)

1. **Documento base** (Requirements + MVP Roadmap) — fuente de verdad.
2. **Consolidación operativa** — decisiones cerradas.
3. **Metodología** — cómo se trabaja.
4. **Wireframes** — solo referencia visual.

**Regla de oro:** lo que el documento base no zanja no se decide por intuición; se marca como pregunta de daily o de cliente. Jerarquía de decisión: documento base → nota del cliente (para lo que el base no cubre, p. ej. qué mostrar en el pitch) → criterio del equipo.

> **Nota crítica:** el documento base NO vive en el repo. Claude Code usa `CLAUDE.md` como proxy. Acción pendiente de mayor palanca: incorporar el documento base y la Consolidación a `/docs`.

---

## 1. Estado por Olas

| Ola                   | Estado                 | Detalle                                                                                          |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| **Ola 0 — Fundación** | ✅ 100%                | Monorepo, multi-tenant + RLS, auth/RBAC, auditoría, design system, shell, cliente API.           |
| **Ola 1 — Sebastián** | ✅ 100%                | M01 (org + formalización + documentos/verificación), M03 (expediente + clínico + recordatorios). |
| **Ola 1 — Fabián**    | ✅ 100%                | M04 completo (T-028a/b/c + catálogo público), M14 completo (T-026/027/029/030).                  |
| **Ola 2 — Fabián**    | 🔄 En curso            | PaymentPort (M15 contract-first), M05 donaciones P1, flujo de confianza maquetado.               |
| **Ola 2 — Sebastián** | 🔄 Recién desbloqueada | M06 campañas + M07 apadrinamientos. Desbloqueado por el PaymentPort; puede arrancar.             |
| **Ola 3**             | ⏳ No iniciada         | M08–M13 y M09/M10/M11 (según reparto), superficies restantes.                                    |

---

## 2. Corte de Ola 2 (trabajo de Fabián, T-040 → T-053)

- **T-040 — PaymentPort (M15 contract-first):** interfaz + tipos + `computeBreakdown` (fuente única del desglose, pesos enteros, invariante de suma) + `FakePaymentAdapter`. En `contracts`, aditivo. Desbloqueó a Sebastián. ✅
- **T-050 — M05 donaciones (P1 pitch):** donación de Persona con desglose transparente (vía `computeBreakdown`), casilla "cubro la comisión", recibo automático. RLS + gate. Idempotencia por `idempotencyKey` y `dedupKey`. ✅
- **T-051 — Cableado "Donar":** flujo de donación navegable de punta a punta (CTA público → `/donaciones` bajo RequireAuth, con `returnTo` preservando la org). ✅
- **T-052 — Catálogo público de adopción:** portal `/o/:slug` con "Mascotas en adopción" (consume el endpoint público de Sebastián, leyendo `.items`), detalle público sin datos clínicos, botón "Solicitar adopción" que engancha T-028a. Cierra el círculo de M04. ✅
- **T-053 — Maqueta del flujo de confianza:** recorrido navegable donación real → emisión → código único → verificación pública → evidencia. CERO backend, etiqueta "vista de diseño" en pasos maquetados. Aprobado por el cliente para el pitch. ✅

**Estado de los 5 refinamientos P1 del cliente (nota):** los 5 cubiertos para el pitch — 4 funcionales (casilla comisión, desglose, recibo, badge de tipo de org) + 1 maquetado (flujo de confianza del certificado).

---

## 3. Decisiones de fuente de verdad tomadas en este corte

- **Certificado de donación (RF14):** es alcance real del MVP (M05/§8: plantilla + hash + QR verificable, ESAL con RTE, sin API DIAN). NO está construido. El documento base fija el mecanismo pero NO exige que esté funcional el 13-ago. Decisión (avalada por el cliente el 26-jul): **maqueta para el pitch (T-053), RF14 funcional comprometido post-pitch, no descartado.** Input pendiente del cliente: la plantilla legal (textos ESAL, rep. legal vs. revisor fiscal) — `TODO(client)`.
- **Donación:** autenticada como Persona (patrón T-028a). Donación anónima queda como pregunta de negocio abierta (cliente); el seam de checkout de invitado está aislado y comentado (habilitarlo = mover la ruta fuera de RequireAuth).
- **Catálogo:** solo el portal POR organización (endpoint de Sebastián). El catálogo consolidado GLOBAL es otra superficie del documento base y necesita un endpoint agregado inexistente → futuro.

---

## 4. Separación de voces (trazabilidad)

- **Claude Code:** produce y analiza desde el dominio de Fabián. Su salida es material para decidir, no la decisión.
- **Sebastián:** contraparte real; aprueba lo que toca su dominio (core/, M01, M03).
- **Fabián:** decide en su dominio; lleva al daily lo que cruza fronteras.
- **Cliente:** decide producto/alcance/qué mostrar (p. ej. maqueta vs. funcional, donación anónima, plantilla legal).

---

## 5. Pendientes de coordinación

**Dependen de Sebastián (daily):**

1. Wiring del token `PAYMENT_PORT` @Global en `core/` → Fabián cambia 1 línea (hoy usa el fake con token local + `TODO(core)`).
2. `<Link>` lista→detalle en `AnimalsPage` (seam abierto, su dominio).
3. Endpoint de animal público **individual** (`:id`) → cierra el deep-link del detalle cuando una org tiene >50 adoptables.
4. Endpoint **agregado global** (`GET /public/animals`) → habilita el catálogo consolidado.
5. Hardening del CI contra el rate limit de Docker Hub (propuesta T-CI-01: `services.credentials` + pin por digest; requiere secrets creados por un humano).

**Dependen del cliente:** 6. Donación anónima: ¿sí/no? 7. Plantilla legal del certificado (para el RF14 real).

**Housekeeping:** `.env.example` con `REMINDERS_*`; iconos `shell/icons` (bell/building/document).

---

## 6. Backlog hacia la entrega completa (tres Olas)

**Post-pitch, Ola 2 de Fabián:**

- **RF14 real** (certificado funcional): contrato + tabla RLS + generación + plantilla + hash SHA-256 (patrón `adoption-contract-hash`) + QR + gating ESAL-RTE + endpoint público de verificación. Tarea GRANDE → partir en sub-tareas.
- **M15 real** (adaptador Wompi sobre el PaymentPort): mínimo de monto, idempotencia real, webhooks, conciliación, dispersión T+1.
- **Catálogo consolidado global** (tras endpoint de Sebastián).
- **M09/M10/M11** (según reparto de dominios).

**Ola 2 de Sebastián (ya desbloqueada):** M06 campañas (con rendición), M07 apadrinamientos recurrentes.

**Ola 3:** M08/M12/M13 y superficies restantes.

**Fuera del MVP:** sección 24 en pausa (reembolsos, baja/portabilidad de org, etc.); IA (M16/M17) diferida.

---

## 7. Convenciones vigentes

- Rama `feat/fab/<slice>` desde `main` → gates verdes → PR → **revisión cruzada de Sebastián** → merge squash. Un concern por PR. **Nadie fusiona su propio PR.**
- **DoD:** correr `pnpm turbo run test` COMPLETO (comando del CI, con `--force`), no solo el archivo, antes de reportar cierre.
- **Tras pull con migraciones:** `pnpm install` o `prisma generate` antes de compilar (rojo local de typecheck suele ser cliente Prisma stale, no bug).
- **Tres tipos de rojo en CI, tres respuestas:** infraestructura (reintentar/escalar) · código (arreglar) · cliente stale (regenerar). No confundirlos.
- Commits: Conventional Commits (`feat`/`fix`/`docs`/`chore`...); commitlint los valida.
- **Invariantes:** multi-tenant + RLS; RBAC deny-by-default; auditoría UTC append-only; tipos desde `@adoptafacil/contracts`; sin browser storage; integraciones tras puertos simulables; personalización solo por tokens.

---

_Fin del documento único de alineación · AdoptaFácil V2.0 · corte 2026-07-26 · Ola 2 en curso._
