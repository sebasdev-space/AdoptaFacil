# Plan de continuación — Sebastián (v2)

> **Corte:** 23 de septiembre de 2026 · Basado en: (1) reconciliación de `git log` contra
> `docs/PLAN-CONTINUACION-SEBASTIAN_2026-08-14.md` (el plan anterior está 100% cerrado — S-1 a
> S-8, PRs #162 a #174); (2) `docs/AdoptaFacil_FSD_v3.5.md.pdf` (FSD del cliente, 12-sep-2026);
> (3) `docs/PlanDeAuditoria.html` ("Document Suite v1.0", 8 plantillas legales exactas que
> aterrizan el FSD).
> **Reemplaza**, para efectos de reparto de trabajo, a `PLAN-CONTINUACION-SEBASTIAN_2026-08-14.md`.

## Estado de partida

Tu plan anterior (S-1 a S-8: firma legal, DIAN mock, duplicidad, reporte público de campaña,
voluntariado, reputación, dashboards, pagos recurrentes fallidos) está **completo y mergeado**.
Fabián también cerró el suyo (F-1 a F-8) y desde entonces migró el recaudo de Wompi a
MercadoPago (PR #177, 19-sep) — **decisión ya cerrada, no es un punto abierto en este plan**.

Este plan nuevo sale de cruzar el FSD v3.5 del cliente (12-sep) contra lo que ya existe en el
código. Dos hallazgos del FSD condicionan el orden de prioridad:

1. El **Doc 4 (Declaración de Comportamiento del Animal)** es un modelo tuyo (M03) que **bloquea**
   el `Placement` engine que Fabián tiene que construir (comodato de salida temporal, acta de
   retorno) — por eso va primero.
2. El **"documento de Observaciones"** que el FSD referencia repetidamente (base de la cláusula de
   mandato, mecanismo de hash server-side, hallazgo de SSR) **el cliente no lo suministró** —
   queda como pendiente administrativo a solicitar, no bloquea el resto de este plan.

## Regla de trabajo (sin cambios)

Mismo criterio que el plan anterior: construyes tu módulo completo — backend y frontend — de
principio a fin. Solo avisas a Fabián cuando cambias un contrato que él consume, necesitas algo
que vive en su dominio (M04, M05, M09, M10, M11, M14, M15), o tocas infraestructura compartida
(`shell/router/routes.tsx`, `.github/CODEOWNERS`, `turbo.json`/`package.json` raíz, build de
`packages/contracts`, CI).

**Tus módulos (sin cambios):** `core/` (cerrado), M01 Organizaciones, M03 Animales, M06
Campañas, M07 Apadrinamientos, M08 Voluntariado, M12 Reputación, M13 Dashboards.

**Convenciones que ya aplican:** rama `feat/seb/<slice>` desde `main` actualizado → CI verde →
PR → nadie fusiona su propio PR → squash. `pnpm turbo run lint typecheck build test` completo
antes de reportar un cierre. Conventional Commits. Multi-tenant + RLS en toda tabla nueva
(`ENABLE`+`FORCE`+policy `tenant_isolation` + prueba de no-filtración). RBAC deny-by-default.
Auditoría append-only vía `AuditService`. Contratos solo aditivos. Una migración por PR.

---

## Ola 1 — bloqueante para el Placement engine de Fabián

### S-9 · M03 — `AnimalBehaviorDisclosure` (Doc 4 del FSD, "Safe Harbor" Art. 2353 C.C.)

**Por qué:** el FSD (Sección C.3) y el checklist QA bloqueante (ítem #2) exigen que ningún
`Placement` distinto de `ADOPCION` (comodato/salida temporal/hogar de paso) pueda generarse sin
una declaración de comportamiento del animal ya firmada. Hoy `AnimalBehaviorDisclosure` no
existe en ningún lado del código (confirmado). Es tuyo porque vive sobre `Animal` (M03), pero
**Fabián no puede avanzar su Placement engine sin esto** — es la pieza #1 en prioridad.
**⚠️ Afectación cruzada:** avísale a Fabián en cuanto publiques el contrato — él necesita el
`behaviorDisclosureId` para bloquear la generación del contrato de comodato (Doc 3) en su
`Placement` (M04). Coordina con él la forma exacta del check ("dado un Placement
SALIDA_TEMPORAL/HOGAR_DE_PASO sin behaviorDisclosureId, la generación del contrato debe
rechazarse en backend, incluso para OWNER" — es el criterio Given-When-Then #2 del FSD).

```
Lee CLAUDE.md antes de empezar. Módulo M03 (tuyo). Vas a construir AnimalBehaviorDisclosure,
el paso bloqueante de declaración de comportamiento que el FSD del cliente (docs/AdoptaFacil_FSD_v3.5.md.pdf,
Sección C.3) y su Doc 4 (docs/PlanDeAuditoria.html) exigen antes de cualquier salida temporal u
hogar de paso. Es NUEVO — hoy no existe nada de esto en el código.

Pasos:
1. Rama `feat/seb/m03-animal-behavior-disclosure`.
2. Contract-first: define en packages/contracts/src/animals.ts (o un archivo nuevo si el
   existente ya está muy cargado) la interfaz AnimalBehaviorDisclosure — animalId,
   organizationId, declaredByUserId, reactivityNotes (opcional), biteHistory (bool) +
   biteHistoryDetail (opcional), childrenCompatibility (enum: SI | CON_SUPERVISION |
   NO_RECOMENDADO), medicalConditionsRelevant (opcional), declaredAt, y una referencia a la
   firma electrónica del declarante (mismo mecanismo de hash server-side + inmutabilidad que ya
   usa el resto del proyecto para firmas — revisa cómo lo resolviste en S-1, firma legal del
   representante).
3. Modelo Prisma con organization_id + RLS (ENABLE+FORCE+tenant_isolation), append-only tras la
   firma (mismo patrón que otras tablas inmutables del proyecto: reject UPDATE/DELETE vía
   trigger, salvo el campo que efectivamente registra la firma).
4. Backend `apps/api/src/modules/animals/` (o un archivo dedicado dentro de ese módulo):
   endpoint para crear la declaración (rol de la organización — Owner/Administrator/Operator,
   mismo patrón de @Roles del resto de M03), y un endpoint de solo lectura que devuelva si un
   animal tiene una declaración VIGENTE — este es el que Fabián va a consumir desde M04.
5. Frontend: modal/formulario en la ficha del animal (reactividad con perros/gatos, antecedente
   de mordida, compatibilidad con niños, condiciones médicas), con firma electrónica del
   declarante (nombre completo + botón "Firmar y continuar", mismo componente de firma que ya
   usas en otros flujos si existe uno reutilizable).
6. Publica el contrato aditivo y AVISA A FABIÁN apenas esté listo — su Placement engine (M04)
   necesita leer behaviorDisclosureId para bloquear la generación de contratos de comodato.
   Coordinen juntos el criterio exacto de bloqueo (ver el Given-When-Then #2 del checklist QA
   del FSD: llamar el endpoint de generación de contrato SIN behaviorDisclosureId debe
   devolver 4xx explícito, incluso para un rol OWNER).
7. Pruebas: creación de la declaración, inmutabilidad tras firmar, endpoint de solo lectura,
   no-filtración multi-organización (tabla nueva de negocio).
8. `pnpm turbo run lint typecheck build test` completo.
9. PR `feat(m03): declaración de comportamiento del animal (AnimalBehaviorDisclosure, FSD Doc 4)`.
```

---

## Ola 2 — Formalización según el FSD v3.5 (M01, Sección A)

### S-10 · M01 — Wizard de formalización de 5 pasos + porcentaje real + distinción visual

**Por qué:** el FSD (Sección A) especifica un dashboard de formalización muy concreto que hoy no
existe tal cual: porcentaje explícito (arranca en 0%), wizard "Paso X de 5" con microcopia
específica por paso (empezando por "sube la cédula del representante legal"), y colores
DISTINTOS e intencionales entre `OBSERVADO` (amarillo, "corregible") y `RECHAZADO` (rojo,
"empieza de nuevo") — con el motivo SIEMPRE visible en el cuerpo de la fila, nunca oculto tras
un clic o tooltip.
**Buena noticia de partida:** el cálculo YA es 100% derivado y arranca en 0 — `computeVerificationLevel()`
(`apps/api/src/modules/org/verification.ts`) ya satisface literalmente el criterio bloqueante #1
del checklist QA del FSD (no hay ninguna ruta de escritura manual sobre el nivel/porcentaje).
Este ítem es sobre todo de UX/frontend y de exponer ese cálculo como wizard, no de rehacer el
motor.

```
Módulo M01 (tuyo). Vas a alinear el dashboard de formalización con lo que el FSD del cliente
especifica en su Sección A (docs/AdoptaFacil_FSD_v3.5.md.pdf).

Contexto: computeVerificationLevel() (apps/api/src/modules/org/verification.ts) ya calcula el
nivel de verificación puramente desde documentos APROBADO + vigentes, arrancando en 0 — no hay
que tocar ese motor. Lo que falta es la CAPA de presentación: porcentaje explícito, wizard de
pasos, y la distinción visual OBSERVADO/RECHAZADO.

Pasos:
1. Rama `feat/seb/m01-wizard-formalizacion-fsd`.
2. Decide y documenta en el PR cómo se deriva el "% completado" del FSD a partir del nivel/
   ladder ya existente (VERIFICATION_LEVELS) — por ejemplo, documentos-vigentes-aprobados /
   documentos-requeridos-del-tier-actual. No inventes un campo nuevo escrito a mano; debe seguir
   siendo 100% derivado, igual que el nivel.
3. Frontend: tarjeta de formalización con la barra de puntos (● paso actual, ○ pendiente — el
   FSD es explícito en que NINGÚN punto se pinta en verde/check en estado Informal) + "% completado".
4. CTA dinámico "Siguiente paso" con el título/copy generado desde la configuración de
   requisitos existente (VERIFICATION_LEVELS / requiredDocuments) — nunca hardcodeado en el
   componente, mismo principio que ya usa el backend.
5. Fila de cada documento: badge de color por DocumentStatus (ya existe casi 1:1 en el backend:
   Pending/UnderReview/Observed/Approved/Rejected) — confirma que el frontend actual realmente
   distingue Observed (amarillo, "Necesita corrección: {motivo}", botón [Subsanar]) de Rejected
   (rojo, "Rechazado: {motivo} — este documento no es válido", botón [Cargar documento nuevo])
   con colores y microcopia DISTINTOS; si hoy comparten estilo, sepáralos.
6. El motivo de observación/rechazo se muestra siempre en el cuerpo de la fila, nunca en un
   modal/tooltip que haya que abrir.
7. Al subsanar: actualización optimista a EN_REVISION en el cliente + toast de confirmación,
   confirmado por el backend en segundo plano.
8. Pruebas: derivación del %, renderizado correcto de cada estado con su color/microcopia,
   no-regresión sobre el cálculo de verification level ya testeado.
9. `pnpm turbo run lint typecheck build test` completo.
10. PR `feat(m01): wizard de formalización y porcentaje según FSD v3.5`.
```

### S-11 · M01 — Campos de firmante dinámico para el certificado DIAN — ✅ RESUELTO SIN CÓDIGO (23-sep)

**Resultado de investigar el código real de Fabián antes de construir nada** (`donation-certificates.service.ts`,
`certificate-document.tsx`, PR #155): su propio TODO dice textualmente que solo está esperando el
**nombre** del representante legal — algo que S-1 (`GET /org/legal-representative`, PR #162) YA
resuelve — no la lógica de "revisor fiscal / contador público" del Doc 6. Esa distinción viene de
`docs/PlanDeAuditoria.html`, un documento que el propio archivo etiqueta como "Vista Previa (Mock
Data)", sin regla de negocio confirmada por el cliente sobre cuándo una organización "requiere"
un revisor fiscal (depende de tipo de sociedad/ingresos según la ley colombiana). Construir
`requiere_revisor_fiscal`/`has_contador_publico` ahora sería inventar un requisito no confirmado,
además de redundante (Fabián no está bloqueado por eso).

**Decisión (con el usuario, 23-sep):** no se construye nada. Queda pendiente un mensaje para
Fabián (a consolidar con los demás) avisándole que S-1 ya está listo para que muestre el nombre
real del representante legal en el certificado. El tema revisor fiscal/contador queda registrado
aquí como **pendiente de confirmación del cliente**, no como tarea de desarrollo.

<details>
<summary>Especificación original (no ejecutada)</summary>

**Por qué:** el Doc 6 del cliente (certificado de donación, `docs/PlanDeAuditoria.html`) resuelve
el firmante dinámicamente: revisor fiscal si la organización lo requiere, si no un contador
público, si no el representante legal. Hoy `Organization`/`LegalRepresentative` (tuyos, M01) no
tienen esos dos campos ni la identidad de un revisor fiscal/contador.
**⚠️ Afectación cruzada:** esto lo necesita Fabián para su certificado real (M05, ya construido
en PR #155) — **habla con él primero**: puede que ya lo haya resuelto de otra forma (por ejemplo
un campo genérico) y este ítem sea innecesario o deba ajustarse a lo que él ya tiene, en vez de
publicar algo redundante.

```
Módulo M01 (tuyo) — CONDICIONADO a hablar primero con @fabian. Antes de escribir código,
confirma con él cómo resuelve HOY el firmante del certificado de donación real (M05, PR #155) —
puede que ya tenga un campo o convención para esto. Si confirma que necesita
requiere_revisor_fiscal/has_contador_publico desde tu lado:

Pasos:
1. Rama `feat/seb/m01-firmante-certificado-dian`.
2. Extiende Organization (o LegalRepresentative, según lo que decidas con Fabián) con los campos
   necesarios para resolver el firmante: si requiere revisor fiscal, si tiene contador público,
   y la identidad de esa persona (nombre, documento, tarjeta profesional) — contrato aditivo en
   packages/contracts/src/org.ts.
3. Expón esto en el mismo endpoint de solo lectura que ya publicaste en S-1 (representante legal
   vigente + firma activa) — amplíalo, no crees uno paralelo.
4. Pruebas: los tres casos de firmante (revisor fiscal / contador / representante legal).
5. `pnpm turbo run lint typecheck build test` completo.
6. PR `feat(m01): campos de firmante dinámico para certificado DIAN (FSD Doc 6)`.
7. Avísale a @fabian que ya está publicado.
```

</details>

---

## Ola 3 — Extensión de M08 (Constancia de Servicio Social, Doc 8 del FSD)

### S-12 · M08 — Completar `VolunteerCertificate` con acudiente, colegio/convenio y bitácora

**Por qué:** tu módulo de voluntariado (M08, cerrado en PR #166) ya tiene el umbral de 80h y la
cita correcta a la Resolución 4210/1996 — coincide exactamente con lo que pide el cliente. Pero
el Doc 8 (`docs/PlanDeAuditoria.html`) exige datos que `VolunteerCertificate`
(`packages/contracts/src/volunteering.ts:225`) no captura hoy: acudiente/guardián para menores,
colegio + número de convenio institucional, y una bitácora día-a-día (fecha, horas, actividad,
supervisor) en vez de solo el total agregado. **Sin dependencias cruzadas** — es 100% tuyo.

```
Módulo M08 (tuyo, ya cerrado — esto es una EXTENSIÓN aditiva, no una reconstrucción). Vas a
completar VolunteerCertificate para que coincida con el Doc 8 del cliente
(docs/PlanDeAuditoria.html) — constancia de servicio social estudiantil.

Contexto: DEFAULT_STUDENT_SERVICE_MIN_HOURS = 80 y la cita a la Resolución 4210/1996 ya están
correctas. Falta: identidad del acudiente (para menores), colegio + convenio institucional, y el
detalle día-a-día de horas (hoy solo existe totalApprovedHours agregado).

Pasos:
1. Rama `feat/seb/m08-constancia-servicio-social-completa`.
2. Contract-first, aditivo, en packages/contracts/src/volunteering.ts: agrega a
   VolunteerCertificate (o a una interfaz relacionada si prefieres no sobrecargarla) los campos
   de acudiente (nombre, documento — solo si el voluntario es menor de edad), colegio (nombre +
   número de convenio institucional), y un arreglo de bitácora (fecha, horas, actividad,
   supervisor) que reemplace/complemente el total agregado actual.
3. Decide y documenta en el PR: ¿el acudiente/colegio se capturan al inscribirse (enrollment) o
   al emitir el certificado? Igual con la bitácora: ¿se deriva de los registros de horas ya
   existentes (uno por sesión aprobada) o es un campo nuevo a diligenciar aparte? Prefiere
   derivarlo de datos ya existentes si es posible, en vez de duplicar captura.
4. Backend: actualiza la emisión del certificado para incluir estos datos; si el voluntario es
   menor de edad, el acudiente pasa a ser obligatorio antes de poder emitir.
5. Frontend: agrega los campos que falten al formulario de inscripción (si el voluntario declara
   ser menor) y al certificado renderizado/descargable.
6. Pruebas: emisión con y sin menor de edad, bitácora derivada correctamente de las horas
   aprobadas, no-regresión sobre los tests de S-6 ya existentes.
7. `pnpm turbo run lint typecheck build test` completo.
8. PR `feat(m08): constancia de servicio social completa — acudiente, colegio y bitácora (FSD Doc 8)`.
```

---

## Coordinación pendiente — no ejecutar en solitario todavía

### Onboarding financiero disparado desde tus páginas (FSD Sección A.4)

El FSD dispara el modal de "conecta dónde quieres recibir las donaciones"
(`OrganizationPayoutAccount`) desde tres acciones: "Publicar campaña" (M06, tuyo), "Activar
apadrinamientos" (M07, tuyo) y "Activar botón de donación pública" (perfil de organización,
M01/M05 según cómo esté hoy repartido). El **modelo de la cuenta de pago y el worker de
dispersión son de Fabián (M15)** — pero el disparador vive en tus páginas.

**No lo pongas en el sprint todavía.** Antes de construir nada: coordina con Fabián quién
publica el contrato de `OrganizationPayoutAccount` y su endpoint de creación/estado, y quién es
dueño del modal en sí (podría vivir en un componente compartido). Igual que S-1 en el plan
anterior, esto es "avísale y decidan juntos el punto de integración" antes de que cualquiera
empiece.

### Mensaje para Fabián — no es tuyo, pero anótalo

La cláusula de mandato y el worker de dispersión del FSD (Sección 3.2 y 4) están redactados
específicamente para Wompi persona natural (retención de 30 días, límite a Bancolombia/Nequi).
Ahora que MercadoPago es la pasarela definitiva, esa cláusula legal y las restricciones del
worker necesitan revalidarse contra las reglas reales de MercadoPago — es 100% de su dominio
(M15/pagos), pero vale la pena que se lo señales explícitamente para que no se construya (o deje
de construirse) algo pensado para las reglas de otra pasarela.

---

## Pendiente administrativo (no es una tarea de desarrollo)

Pedirle al cliente el **"documento de Observaciones"** que el FSD v3.5 referencia repetidamente
(base de la cláusula de mandato, mecanismo de hash server-side de la Sección 1.2, hallazgo de
SSR de la Sección 1.1, texto completo del comodato). No bloquea este plan, pero varias cláusulas
legales del FSD son citas a un documento que no tenemos — mejor tenerlo antes de que alguien
redacte texto legal definitivo basado en una referencia incompleta.

---

## Resumen de afectaciones cruzadas a vigilar

| Actividad                      | Necesitas de Fabián                                                            | Él necesita de ti                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| S-9 (AnimalBehaviorDisclosure) | —                                                                              | El contrato/endpoint de solo lectura, **antes** de que él construya el Placement engine (comodato/retorno) |
| S-11 (firmante DIAN)           | ✅ Resuelto por investigación de código (23-sep) — no era necesario            | Avisarle que S-1 (`GET /org/legal-representative`) ya está listo para el nombre del representante legal    |
| Onboarding financiero (A.4)    | Definir juntos quién publica `OrganizationPayoutAccount` y dónde vive el modal | —                                                                                                          |
| S-10, S-12                     | Ninguna                                                                        | Ninguna                                                                                                    |

Todo lo demás: trabaja directo, sin pedir permiso.
