# AdoptaFácil V2.0 — Documento único de alineación

> **Propósito.** Reemplazar los resúmenes de chat previos como **corte de verdad único**. Consolida estado, decisiones fundamentadas en el documento base, y pendientes. Perspectiva: **Fabián (Dev #2)**.
> **Corte:** 24 de julio de 2026 · `main` @ `c769192` (PR #36 fusionado). **Hito:** pitch del 13 de agosto de 2026.
> **Reemplaza a:** los dos resúmenes de sesión anteriores (Sebastián @ #30 y Fabián @ #32). A partir de aquí, este es el documento vigente.

---

## 0. Jerarquía de fuentes (no negociable)

1. **Fuente de verdad:** documento base _"AdoptaFácil V2.0 — Requirements + MVP Roadmap"_.
2. **Consolidación operativa:** decisiones cerradas (deltas sobre el documento base).
3. **Metodología de desarrollo:** cómo se trabaja (Prompt Specs, olas, fronteras).
4. **Wireframes:** solo referencia visual. No normativos. Ante contradicción, prevalece el documento base.

**Regla de oro:** cuando ni Fabián ni Sebastián tienen respuesta, se decide con el documento base, no por intuición. Lo que el documento base no zanja (p. ej. valores de `AnimalStatus`, baja de organización) **no se decide en silencio**: se marca como pregunta de daily.

> **Nota crítica de infraestructura.** El documento base **no vive en el repo**. Claude Code solo ve `CLAUDE.md`, `docs/TASKS.md`, `docs/CONTRACTS.md` y la nota del cliente. Por eso las citas de RF/RNF/secciones se verifican contra `CLAUDE.md` (proxy), no contra el texto normativo. **Acción de mayor palanca pendiente:** incorporar el documento base y la Consolidación a `/docs` (solo lectura) y declararlos fuente #1 en `CLAUDE.md`. Mientras eso no ocurra, la deriva de nomenclatura está estructuralmente latente.

---

## 1. Estado actual (snapshot verificado en `main`)

| Ola                   | Estado                   | Detalle                                                                                                                                                                      |
| --------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ola 0 — Fundación** | ✅ 100%                  | Monorepo, multi-tenant + RLS, auth/RBAC, auditoría, design system, shell, cliente API.                                                                                       |
| **Ola 1 — Sebastián** | ✅ Completa              | M01 (org + formalización + documentos/verificación), M03 (expediente + clínico versionado + recordatorios BullMQ), refactor puertos Storage/Notification en `core/` (T-107). |
| **Ola 1 — Fabián**    | ✅ Cerrada (salvo T-030) | M14 al 90% (T-026/027/029 ✅; falta badge T-030). **M04 completo**: T-028a/b/c fusionados.                                                                                   |
| **Ola 2 — Sebastián** | ⏸ Bloqueada              | M06 campañas + M07 apadrinamientos. **Detenido esperando `PaymentPort`.**                                                                                                    |

**M04 (adopciones) — completo en `main`:**

- **T-028a** (#33): solicitud (Persona) + kanban de evaluación.
- **T-028b** (#35): contrato + firma electrónica + inmutabilidad (hash SHA-256).
- **T-028c** (#36 + fix `8ef0ed1`): seguimiento post-adopción (hitos, evidencias, alertas overdue).

**Repo limpio:** ramas de feature borradas tras merge squash; `main` @ `c769192`.

---

## 2. Decisiones fundamentadas en el documento base

Para que todos los chats compartan la misma verdad:

**Portales (§8):** dos vistas públicas — catálogo consolidado general + portal individual por subdominio/`/o:slug`. Personalización **solo por tokens CSS**, nunca código libre.

**Indicador de transparencia:** `nivel ← verificationLevel`; `% formalización ← posición en FORMALIZATION_SEQUENCE` (`esal`=80%, `esal_rte`=100%); `rendición ← placeholder` hasta M05/M06.

**M04 adopciones (RF10, RF11, RF12; matriz de roles §13):**

- Navegar animales adoptables es **público** (catálogo); crear la solicitud es **autenticado como Persona**.
- RF10: **mensaje ≥ 50 caracteres**, **una solicitud activa por (animal, usuario)** (garantía en BD, índice único parcial).
- **Conflicto de interés (§13):** un miembro no postula a animales de su propia organización.
- RF11: contrato con firmantes dinámicos, **inmutable tras firma** (hash). Marco legal: **Ley 527/1999** (firma electrónica) + **Ley 1581/2012** (datos personales).
- RF12: seguimiento con hitos, cuestionarios, fotos, alertas.

**Motor de dinero (Consolidación §8) — decisiones cerradas, no reabrir:**

- Comisión plataforma **4%** sobre bruto. Pasarela **Wompi**, modelo **recaudo + dispersión T+1** (sin split en checkout).
- Comisión pasarela: 2,65% + $700 + IVA. IVA solo sobre comisiones. Desglose `bruto → comisión-plataforma → comisión-pasarela → neto`.
- Sin custodia de saldos de terceros. SARLAFT/KYC básico (RF28) vigente.

**Fuera del MVP:** sección 24 en pausa (reembolsos, transferencia inter-org, baja/portabilidad de org, especie, multi-idioma/divisa); IA (M16/M17) diferida.

---

## 3. Corrección de referencia detectada (§12 → §13)

La matriz de roles es **§13** por convención de todo el repo (`auth.ts`, `CONTRACTS.md`, controllers). T-028a quedó como único outlier citando §12 en 5 sitios (comentarios/strings). **Pendiente:** fix cosmético T-032 (solo citas, sin lógica), PR aparte, cuando haya holgura.

---

## 4. Separación de voces (para no colapsar la trazabilidad)

En estos hilos intervienen **tres voces distintas** que no deben confundirse:

- **Claude Code:** produce y analiza **desde el dominio de Fabián**. Su salida es _material para decidir_, no la decisión tomada.
- **Sebastián (Dev #1):** contraparte real. **Aprueba lo que toca su dominio** (`core/`, M01, M03) vía revisión cruzada.
- **Fabián (Dev #2):** decide en su dominio y lleva al daily lo que cruza fronteras.

Un reporte de Claude Code que toca `core/` **no es un acuerdo**: es una propuesta que va al daily.

---

## 5. Pendientes de coordinación (daily con Sebastián)

**Para Sebastián (desbloquean a Fabián):**

1. **Enum `OrganizationType`** en `contracts/src/org.ts` + expuesto en `OrganizationPublic` → desbloquea **T-030** (badge). ¿Todas las orgs o solo formalizadas?
2. **Endpoint público de animales adoptables** `GET /public/organizations/:slug/animals` (`AnimalSummary[]`, `SECURITY DEFINER`/`organization_public`) → desbloquea catálogo público de adopción y sección "Mascotas en adopción" (T-026). Definir qué `AnimalStatus` cuenta como "adoptable" y paginación/filtros.
3. **`<Link>` lista→detalle** en `AnimalsPage` (una línea, su dominio) → cierra el seam de navegación de T-031.
4. Estrechar a **Veterinario** el gating de escritura clínica cuando el panel exponga acciones (hoy T-031 solo cablea vistas GET, correcto).

**Para coordinar (cruza fronteras):** 5. **`PaymentPort`** — contrato de pagos, vive en `core/`. **En acuerdo, pendiente de daily** (ver §6). Desbloquea la Ola 2 de Sebastián. 6. **Baja de organización vs. inmutabilidad de contratos firmados:** el trigger de T-028b bloquea UPDATE de contratos `signed` pero permite DELETE por cascada. Tensión entre RF11 (inmutabilidad probatoria) y ciclo de vida del tenant. Conecta con sección 24 (en pausa). Default actual razonable; confirmar con el cliente cuando salga de pausa.

**Housekeeping:** 7. Reflejar `REMINDERS_SCAN_INTERVAL_MS` y `REMINDERS_WINDOW_DAYS` en `.env.example`. 8. Iconos de "documento" y "campana" faltantes en `shell/icons` (gap menor de Fabián).

---

## 6. `PaymentPort` — estado: EN ACUERDO, pendiente de daily

Borrador revisado desde el lado consumidor (M06/M07/M15). **No se ejecuta hasta acordar propiedad + dos bloqueantes.**

**Propiedad (a zanjar):** interfaz + tipos + función pura de desglose en `packages/contracts` (co-diseño, aditivo); wiring en `core/` (token `PAYMENT_PORT` @Global) lo mergea Sebastián; ubicación y autoría del `FakePaymentAdapter` a definir.

**Bloqueantes reales antes de escribir código:**

- **(a) intención-vs-cargo:** usar `intendedAmount` (lo que debe llegar al beneficiario) + `commissionPayer`, con el puerto haciendo _gross-up_ cuando paga el donante. Un `amountGross` único es ambiguo para la casilla P1 "cubro la comisión" y rompe el % de transparencia.
- **(b) `idempotencyKey`** en la firma de `createCollection`/`createPayout` (un reintento no debe duplicar cobro/pago).

**Refinamientos (aceptables):** función pura de desglose compartida + **redondeo en pesos enteros** (COP sin decimales, regla explícita); IVA itemizado (`platformIva`/`gatewayIva`); estados tipados (`PaymentStatus`/`PayoutStatus`); webhook con verificación de firma + dedup key; SARLAFT se valida en M15 antes de invocar el puerto.

**No entra en el puerto:** lógica de campañas/apadrinamientos (M06/M07 lo consumen), reembolsos/disputas (§24), certificado de donación (M05), ledger contable (M15), custodia de saldos.

**Regla:** redactar los tipos **después** del daily (el punto (a) cambia la firma; escribirlos antes es reescribirlos dos veces).

---

## 7. Backlog restante

| Tarea                                                           | Estado              | Dependencia                               |
| --------------------------------------------------------------- | ------------------- | ----------------------------------------- |
| T-030 — Badge `OrganizationType` (cierra M14)                   | Bloqueada           | Enum de Sebastián                         |
| T-032 — Fix cita §12→§13                                        | Pendiente (trivial) | Ninguna                                   |
| T-031b — Superficie "mis seguimientos" del adoptante            | Backlog             | Wrappers ya listos; cablear ruta en shell |
| `PaymentPort` (contract-first)                                  | En acuerdo          | Daily (propiedad + 2a/2b)                 |
| Error boundary a nivel tarjeta kanban                           | Backlog (mejora)    | Ninguna                                   |
| Refinamientos P1 del pitch (casilla comisión, desglose, recibo) | Ola 2               | Motor de dinero                           |

---

## 8. Convenciones de trabajo (vigentes)

- **Flujo por tarea:** rama `feat/fab/<slice>` desde `main` actualizado → gates verdes → push → PR → **revisión cruzada de Sebastián** → merge squash. **Un concern por PR.**
- **Nadie fusiona su propio PR:** la revisión cruzada es invariante, incluso en tareas de solo-frontend.
- **⚠️ NUEVA — Definición de Hecho:** antes de reportar una tarea como cerrada, correr **`pnpm turbo run test` completo** (el mismo comando del CI), no solo el archivo tocado. _(Origen: el bug de T-028c se coló porque el verde local fue parcial.)_
- **Regla de oro:** un Prompt Spec nunca pide cambios fuera del dominio del dueño. Si una tarea lo requiere, primero se acuerda y publica el contrato.
- **Invariantes no negociables:** multi-tenant + RLS; RBAC deny-by-default; auditoría append-only (UTC en auditoría, hora Colombia en UI); tipos desde `@adoptafacil/contracts`; sin browser storage; integraciones tras puertos simulables; personalización solo por tokens.

---

_Fin del documento único de alineación · AdoptaFácil V2.0 · corte 2026-07-24 · `main` @ #36._
