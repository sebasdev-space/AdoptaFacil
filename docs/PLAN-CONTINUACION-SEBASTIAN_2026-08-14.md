# Plan de continuación — Sebastián

> **Corte:** 14 de agosto de 2026 · Basado en el Radar de avance (auditoría de código + reconciliación con git, `git rev-list --count HEAD` = 337).
> **Reemplaza**, para efectos de reparto de trabajo, a cualquier reparto anterior por carpeta compartida.

## Regla de trabajo, vigente desde hoy

Cada desarrollador construye **su módulo completo — backend y frontend — de principio a fin**.
Ya no se reparte por capa ni por archivo compartido: el dueño del módulo decide y ejecuta todo
dentro de él, sin pedir permiso ni co-revisión previa.

**Solo informas a Fabián cuando:**

1. Cambias un contrato en `packages/contracts` que él ya consume, o publicas uno nuevo que él va
   a necesitar.
2. Tu módulo necesita un campo, tabla o endpoint que vive en un módulo de él (M04, M05, M09, M10,
   M11, M14, M15).
3. Tocas infraestructura verdaderamente compartida: `shell/router/routes.tsx`,
   `.github/CODEOWNERS`, `turbo.json` raíz, `package.json` raíz, config de build de
   `packages/contracts`, o el pipeline de CI.

Fuera de esos tres casos, no hay que coordinar ni avisar — trabajas y abres PR directo.

**Tus módulos (dueño único, backend + frontend):** `core/` (tenant, auth, RBAC, auditoría —
cerrado), M01 Organizaciones, M03 Animales (cerrado), M06 Campañas, M07 Apadrinamientos,
M08 Voluntariado, M12 Reputación, M13 Dashboards y analítica.

## Convenciones que ya aplican (recordatorio, no cambian)

- Rama `feat/seb/<slice>` desde `main` actualizado → CI en verde → PR → **nadie fusiona su propio
  PR** → merge squash. Un concern por PR.
- **DoD real:** corre `pnpm turbo run lint typecheck build test` completo (el comando de CI, con
  `--force` si hace falta) antes de reportar un cierre — no basta con el archivo suelto.
- Commits en Conventional Commits (`feat:`, `fix:`, `docs:`...).
- **Invariantes que no se negocian:** multi-tenant + RLS en toda tabla nueva de negocio
  (`ENABLE`+`FORCE ROW LEVEL SECURITY`+policy `tenant_isolation`, más la prueba de no-filtración);
  RBAC deny-by-default con `@Roles`; auditoría append-only vía `AuditService`; contratos
  publicados en `packages/contracts` de forma solo aditiva; integraciones externas detrás de
  puertos simulables.
- **Una migración por PR.** Si necesitas tocar algo fuera de tus tablas (por ejemplo
  `prisma/schema/payments.prisma` de Fabián) por cualquier motivo, avísale antes de correr
  `prisma migrate dev`.

---

## Ola 1 — cerrar pendientes de M01

### S-1 · M01 — Firma virtual cifrada del representante legal

**Por qué:** el documento técnico del cliente (RF19–RF23) exige firma virtual cifrada
(AES-256-GCM) del representante legal, con rollback transaccional si falla el guardado y bloqueo
si la firma es inválida. No se encontró evidencia de esto en el código actual.
**⚠️ Afectación cruzada:** en cuanto publiques el endpoint de solo lectura para consultar el
representante legal vigente y si tiene firma activa, avisa a Fabián — lo necesita para el
certificado de donación real (F-3 en su documento, M05).

```
Lee CLAUDE.md antes de empezar. Módulo M01 (tuyo, completo). Vas a implementar la firma virtual
cifrada del representante legal, que exige el documento técnico del cliente (RF19-RF23) y que
hoy no existe en el código.

Pasos:
1. Rama `feat/seb/m01-firma-legal`.
2. Modelo LegalRepresentative + Signature con organization_id + RLS, siguiendo el patrón de las
   tablas ya inmutables del proyecto (ej. formalization_transitions) donde aplique append-only.
3. Cifrado AES-256-GCM en reposo (módulo `crypto` de Node, clave desde variable de entorno,
   NUNCA en el código) — la firma no debe poder salir en texto plano por ninguna ruta ni en logs.
4. Transaccionalidad: si falla el guardado de la firma, rollback completo, sin registros
   parciales, sin aprobar la organización.
5. Validación de firma inválida (ilegible, archivo vacío, resolución insuficiente) → estado
   Observado con el mensaje exacto que pide el cliente: "La firma cargada no cumple los
   requisitos mínimos de validación."
6. Identidad real del representante legal: si el nombre no coincide con los documentos o la
   identificación es inconsistente, genera observación automática.
7. Publica un endpoint de SOLO LECTURA (contrato aditivo en packages/contracts/src/org.ts) que
   exponga "representante legal vigente + si tiene firma activa" — sin exponer la firma en sí —
   porque Fabián lo va a necesitar para el certificado de donación real (M05). Avísale cuando
   esté listo.
8. Pruebas: cifrado/descifrado, rollback ante fallo simulado, que la firma nunca aparezca en la
   respuesta de ningún endpoint ni en logs.
9. `pnpm turbo run lint typecheck build test` completo.
10. PR `feat(m01): firma virtual cifrada del representante legal (RF19-23)`.
```

### S-2 · M01 — Flujo mock DIAN con reintentos

**Por qué:** reportes/certificados tributarios de la ORGANIZACIÓN (RF07, RF27-32) — distinto del
certificado de donación de Fabián (RF14, M05). **Sin afectación cruzada.**

```
Módulo M01. Vas a implementar el flujo mock hacia la DIAN para reportes/certificados
institucionales.

Pasos:
1. Rama `feat/seb/m01-flujo-dian-mock`.
2. Interfaz DianProvider con MockDianProvider (mismas firmas que tendría el proveedor real — el
   cambio futuro a DIAN real es solo de inyección de dependencias, igual que los otros puertos
   simulables del proyecto).
3. Estados: EN_PROCESAMIENTO (sin respuesta) con reintentos automáticos 5min → 30min → 2h → 24h
   (usa BullMQ, mismo patrón que reminders/followup); ERROR_DE_ENVIO tras fallo definitivo con el
   mensaje exacto: "No fue posible validar el documento ante la DIAN. El sistema realizará nuevos
   intentos automáticamente."; RECHAZADO_POR_DIAN ante inconsistencia simulada, bloqueando la
   emisión y generando incidente administrativo.
4. Solo organizaciones Formales/ESAL pueden generar estos reportes — cualquier intento desde una
   organización informal se bloquea y se audita.
5. Pruebas: máquina de reintentos, bloqueo por tipo de organización, mensajes exactos.
6. `pnpm turbo run lint typecheck build test` completo.
7. PR `feat(m01): flujo mock DIAN con reintentos escalonados`.
```

### S-3 · M01 — Detección de duplicidad de organizaciones

**Por qué:** RF06 del documento técnico del cliente. **Sin afectación cruzada.**

```
Módulo M01. Implementa la detección de duplicidad de organizaciones: por NIT, razón social,
cámara de comercio o correo institucional.

Pasos:
1. Rama `feat/seb/m01-deteccion-duplicidad`.
2. Al registrar o formalizar una organización, valida contra las organizaciones existentes por
   esos cuatro criterios.
3. Ante coincidencia: bloquea el registro y ofrece tres caminos (solicitar vinculación, recuperar
   acceso, abrir incidencia administrativa) — no lo resuelvas silenciosamente, es una decisión
   que el usuario debe tomar explícitamente.
4. Audita cada intento de registro duplicado.
5. Pruebas: cada uno de los cuatro criterios de duplicidad, y que NO haya falsos positivos entre
   organizaciones legítimamente distintas.
6. `pnpm turbo run lint typecheck build test` completo.
7. PR `feat(m01): detección de duplicidad de organizaciones (RF06)`.
```

---

## Ola 2 — motor de dinero

### S-4 · M06 — Reporte público auditable de campaña

**Por qué:** verificar/cerrar si el reporte público de rendición de cuentas (meta, avance,
evidencias, gasto declarado) ya es consultable sin autenticación.
**⚠️ Afectación cruzada condicional:** solo si esta vista pública debe vivir dentro del portal
individual (M14, de Fabián) en vez de en tu propia página de campaña — en ese caso, coordina con
él el punto de integración antes de tocar su feature.

```
Módulo M06 (tuyo, ya avanzado). Verifica si el reporte público de rendición de cuentas de una
campaña es exportable/consultable sin autenticación. Si ya existe, cierra este ítem sin más
trabajo; si falta, complétalo.

Pasos:
1. Rama `feat/seb/m06-reporte-publico`.
2. Endpoint público (sin auth) que muestre meta, avance y evidencias de una campaña — solo
   lectura, solo datos ya públicos de esa organización.
3. Vista pública — si vive en tu propia página de campaña pública, no hace falta avisar a nadie.
4. Pruebas de que el endpoint público no expone nada más allá de lo que ya es público.
5. `pnpm turbo run lint typecheck build test` completo.
6. PR `feat(m06): reporte público de rendición de cuentas`.
```

### S-5 · M07 — Manejo de pagos recurrentes fallidos

**Por qué:** mencionado en los wireframes de referencia del cliente ("Portal Apadrinamientos:
ilustra recurrencia y pagos fallidos"), no confirmado en el código actual.
**⚠️ Afectación cruzada:** consume el PaymentPort (contrato de Fabián) — no lo modifiques, solo
consume lo que ya existe. Si necesitas algo que no está expuesto (ej. un evento de "cobro
fallido"), pídeselo a él en vez de improvisar tu propia versión.

```
Módulo M07 (tuyo, ya avanzado). Implementa el manejo explícito de pagos recurrentes fallidos en
apadrinamientos.

Pasos:
1. Rama `feat/seb/m07-pagos-fallidos`.
2. Nuevo estado o campo en el modelo de Sponsorship para registrar un cobro recurrente fallido,
   con reintento (mismo patrón de reintentos ya usado en el proyecto).
3. Notifica al apadrinador y, si agota los reintentos, pasa el apadrinamiento a estado suspendido
   (ya existe esa transición) con el motivo correspondiente.
4. Consume el PaymentPort existente — no lo cambies. Si necesitas un evento o método que hoy no
   expone, pídeselo a @fabian.
5. Pruebas: reintentos, suspensión automática tras agotar reintentos, notificación.
6. `pnpm turbo run lint typecheck build test` completo.
7. PR `feat(m07): manejo de pagos recurrentes fallidos`.
```

---

## Ola 3 — módulos nuevos completos y analítica

### S-6 · M08 — Voluntariado

**Alcance:** oportunidades, inscripción, registro de horas, certificados, regla de 80h de
servicio social para grados 10°–11°. **Sin dependencias cruzadas.**

```
Módulo M08 completo, de cero (backend + frontend) — hoy solo existe el contrato vacío en
packages/contracts/src/volunteering.ts y prisma/schema/volunteering.prisma con un comentario
TODO. En el frontend ya existe una ruta placeholder en /organizacion/voluntariado marcada
"comingSoon" — vas a reemplazarla por la funcionalidad real.

Pasos:
1. Rama `feat/seb/m08-voluntariado`.
2. Contract-first: define el contrato en packages/contracts/src/volunteering.ts (oportunidad,
   inscripción, registro de horas, certificado) y publícalo antes de escribir el backend.
3. Modelo de datos en prisma/schema/volunteering.prisma con organization_id + RLS, siguiendo el
   patrón de otra tabla de negocio ya construida.
4. Backend NestJS: nuevo módulo `apps/api/src/modules/volunteering/`, con @Roles en cada
   endpoint (deny-by-default).
5. Frontend: reemplaza el placeholder `OrgVolunteeringPage` (que hoy renderiza `ComingSoon`) por
   la vista real de organización (publicar oportunidad, revisar horas) y la vista de voluntario
   (inscribirse, registrar horas, ver certificado). Quita `comingSoon: true` de `nav-items.ts`.
6. Regla de 80h para servicio social estudiantil de grados 10°-11°: modela el campo de
   "estudiante/grado" y el umbral de horas requerido, con generación de certificado al cumplirlo.
7. Pruebas: unitarias de reglas de negocio (umbral de horas), integración de endpoints,
   no-filtración multi-organización (tabla nueva → gate obligatorio).
8. `pnpm turbo run lint typecheck build test` completo.
9. PR `feat(m08): voluntariado — oportunidades, horas y certificados`.
```

### S-7 · M12 — Reputación

**Alcance:** calificación, reseñas, indicadores públicos, arquitectura preparada para
moderación. **Sin dependencias cruzadas** (las calificaciones apuntan a Organization, que es
tuyo).

```
Módulo M12 completo, de cero.

Pasos:
1. Rama `feat/seb/m12-reputacion`.
2. Contract-first en packages/contracts/src/reputation.ts (calificación 1-5, reseña de texto,
   quién califica, a qué organización, fecha).
3. Modelo con RLS: Rating/Review con organization_id, y una restricción de una calificación por
   usuario por organización (o por transacción — decide y documenta el criterio en el PR).
4. Backend `apps/api/src/modules/reputation/`: crear/consultar calificación, endpoint público de
   indicadores agregados (promedio, cantidad) por organización, endpoint de moderación
   restringido a Admin/SuperAdmin (mismo patrón de @Roles ya usado en el módulo de comunidad de
   Fabián, si ya existe cuando llegues a esto).
5. Frontend: formulario de calificación/reseña (solo para quien tuvo una interacción real con la
   organización — adopción, donación o apadrinamiento completado), vista pública de indicadores
   en el portal (coordina el punto de integración visual con Fabián si esto se muestra en el
   portal M14, pero el dato y el endpoint son tuyos).
6. Pruebas: reglas de negocio (una calificación por usuario/transacción), integración,
   no-filtración.
7. `pnpm turbo run lint typecheck build test` completo.
8. PR `feat(m12): reputación — calificaciones, reseñas e indicadores`.
```

### S-8 · M13 — Dashboards por audiencia + mapa de Colombia + indicadores de negocio

**Por qué:** hoy solo existe un resumen básico de organización (conteos) y un bloque condicional
de salud del sistema para Admin/SuperAdmin. Faltan los dashboards diferenciados, el mapa
geográfico y los indicadores de negocio (RF28) que el documento exige instrumentados desde el
día uno.
**⚠️ Afectación cruzada:** el dashboard financiero de Super Administración necesita datos
agregados de M05 (donaciones) y M15 (payouts/conciliación), que son de Fabián. **No reimplementes
su cálculo de comisión ni de conciliación** — coordina con él el contrato de los endpoints
agregados que vas a consumir (ver F-4/F-5 en el documento de Fabián).

```
Módulo M13 (tuyo). Vas a construir los dashboards diferenciados por audiencia que faltan y los
indicadores de negocio (RF28).

Antes de empezar la parte financiera: pregunta a @fabian si ya tiene listo el endpoint de
conciliación (F-5 en su plan) — si no, empieza por las partes de M13 que no dependen de dinero
(dashboard de Admin con cola de revisión de organizaciones, mapa de Colombia) y deja la parte
financiera para cuando él te avise.

Pasos:
1. Rama `feat/seb/m13-dashboards-audiencia`.
2. Dashboard de Admin: cola de revisión de organizaciones, estado de cada una, incidencias y
   actividad global — reusa los datos que ya expone M01 (tuyo).
3. Dashboard de Super Administración: indicadores consolidados de organizaciones (total, activas,
   nuevas, distribución geográfica), de adoptantes y donantes.
4. Vista geográfica tipo mapa de Colombia (no mapamundi) con las organizaciones ubicadas según su
   localización registrada — una librería ligera de mapas (ej. una basada en GeoJSON de
   departamentos de Colombia) alcanza, no hace falta nada pesado.
5. Indicadores de negocio (RF28): organizaciones registradas, reportes generados, volumen de
   transacciones, tasa de crecimiento mensual — instrumenta esto desde ya, aunque el volumen de
   transacciones dependa del endpoint de conciliación de Fabián (consúmelo cuando esté listo, no
   lo calcules tú mismo con los datos crudos de M05/M15).
6. Dashboard de organización (ya existe parcialmente): agrega el desglose financiero histórico
   que falta.
7. Pruebas: agregaciones con datos de prueba, no-filtración si los dashboards de organización
   muestran datos propios.
8. `pnpm turbo run lint typecheck build test` completo.
9. PR `feat(m13): dashboards por audiencia, mapa de Colombia e indicadores de negocio (RF28)`.
```

---

## Resumen de afectaciones cruzadas a vigilar

| Actividad                    | Necesitas de Fabián                                         | Él necesita de ti                                                                |
| ---------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| S-1 (firma legal)            | —                                                           | Endpoint de solo lectura de representante legal/firma, para su certificado (M05) |
| S-5 (pagos fallidos)         | Evento/método del PaymentPort si falta                      | —                                                                                |
| S-8 (dashboards financieros) | Endpoint de conciliación (M15) antes de construir esa parte | —                                                                                |

Todo lo demás: trabaja directo, sin pedir permiso.
