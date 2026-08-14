# Plan de continuación — Fabián

> **Corte:** 14 de agosto de 2026 · Basado en el Radar de avance (auditoría de código + reconciliación con git, `git rev-list --count HEAD` = 337).
> **Reemplaza**, para efectos de reparto de trabajo, a `docs/NOTA-DECISION-FRONTERAS-M01-M14.md` (julio) y a cualquier reparto por carpeta compartida.

## Regla de trabajo, vigente desde hoy

Cada desarrollador construye **su módulo completo — backend y frontend — de principio a fin**.
Ya no se reparte por capa ni por archivo compartido: el dueño del módulo decide y ejecuta todo
dentro de él, sin pedir permiso ni co-revisión previa.

**Solo informas a Sebastián cuando:**

1. Cambias un contrato en `packages/contracts` que él ya consume, o publicas uno nuevo que él va a necesitar.
2. Tu módulo necesita un campo, tabla o endpoint que vive en un módulo de él (M01, M03, M06, M07, M08, M12, M13, o `core/`).
3. Tocas infraestructura verdaderamente compartida: `shell/router/routes.tsx`, `.github/CODEOWNERS`, `turbo.json` raíz, `package.json` raíz, config de build de `packages/contracts`, o el pipeline de CI.

Fuera de esos tres casos, no hay que coordinar ni avisar — trabajas y abres PR directo.

**Tus módulos (dueño único, backend + frontend):** M04 Adopciones (cerrado), M05 Donaciones,
M09 Banco de recursos, M10 Marketplace, M11 Comunidad, M14 Portales, M15 Administración de
plataforma / motor de pagos.

## Convenciones que ya aplican (recordatorio, no cambian)

- Rama `feat/fab/<slice>` desde `main` actualizado → CI en verde → PR → **nadie fusiona su propio
  PR** → merge squash. Un concern por PR.
- **DoD real:** corre `pnpm turbo run lint typecheck build test` completo (el comando de CI, con
  `--force` si hace falta) antes de reportar un cierre — no basta con el archivo suelto.
- Commits en Conventional Commits (`feat:`, `fix:`, `docs:`...).
- **Invariantes que no se negocian:** multi-tenant + RLS en toda tabla nueva de negocio
  (`ENABLE`+`FORCE ROW LEVEL SECURITY`+policy `tenant_isolation`, más la prueba de no-filtración);
  RBAC deny-by-default con `@Roles`; auditoría append-only vía `AuditService`; contratos
  publicados en `packages/contracts` de forma solo aditiva; integraciones externas detrás de
  puertos simulables (ya tienes StoragePort, NotificationPort, PaymentPort — reúsalos, no
  reinventes uno nuevo salvo que de verdad haga falta).
- **Una migración por PR.** Si necesitas tocar `prisma/schema/org.prisma` (de Sebastián) por
  cualquier motivo, avísale antes de correr `prisma migrate dev`.

---

## Ola 1 — cerrar pendientes

### F-1 · M14 — Subdominios reales de portal

**Por qué:** el documento exige `<organización>.adoptafacil.com`; hoy solo existe la ruta
alterna `/o/:slug`. El campo `subdomain` ya existe en `Organization` pero no se usa en ningún
formulario ni en el ruteo real.
**Criterio de aceptación:** una organización con subdominio configurado resuelve su portal por
host real; sin subdominio configurado, sigue funcionando `/o/:slug` como respaldo.

```
Lee CLAUDE.md antes de empezar. Vas a implementar subdominios reales para el portal individual
(M14), tu módulo completo.

Contexto actual: el campo `subdomain` existe en el modelo Organization
(prisma/schema/org.prisma) pero no se expone en ningún formulario ni se usa para resolver el
portal — el ruteo actual es únicamente por path (`/o/:slug`, apps/web/src/features/portals/**).

Objetivo: resolver el portal por subdominio real (`<slug>.adoptafacil.com`) con `/o/:slug` como
ruta alterna de respaldo mientras no haya DNS configurado, tal como prevé el documento base.

Pasos:
1. Rama `feat/fab/m14-subdominios-reales` desde `main` actualizado.
2. Backend: middleware o guard que lea el header Host, resuelva el `subdomain` contra
   Organization, e inyecte el contexto de organización igual que hoy hace la resolución por slug.
3. Frontend: si detectas que estás en un subdominio, monta directamente el portal individual sin
   pasar por el router de `/o/:slug` (o redirige internamente).
4. Expón el campo `subdomain` en el formulario de personalización de portal (hoy no se edita en
   ningún lado), con validación de unicidad y formato.
5. No agregues tabla nueva — es un campo existente, no hace falta migración de RLS nueva.
6. Prueba dedicada de que un subdominio de la Org A nunca resuelve datos de la Org B.
7. `pnpm turbo run lint typecheck build test` completo antes de abrir PR.
8. PR `feat(m14): subdominios reales de portal`. No cambia ningún contrato que Sebastián
   consuma — no hace falta avisarle.
```

### F-2 · M14 — Completar personalización del portal individual

**Por qué:** el documento exige redes sociales, ubicación con mapa y contacto en el portal
individual; hoy solo hay colores, logo y banner.
**⚠️ Afectación cruzada condicional:** solo si terminas guardando estos campos en la tabla de
`Organization` (de Sebastián) en vez de en tu propia tabla de portal. Si es así, avísale ANTES de
migrar.

```
Módulo M14 (tuyo, completo). Vas a extender la personalización del portal individual con las
secciones que el documento pide y que hoy faltan: redes sociales, ubicación con mapa, contacto.

Pasos:
1. Rama `feat/fab/m14-personalizacion-completa`.
2. Revisa `packages/contracts/src/portals.ts` y extiende `OrganizationPortal`/`PortalTheme` de
   forma ADITIVA (nunca rompas la forma ya publicada) para incluir redes sociales, coordenadas de
   ubicación y contacto.
3. Backend: persiste esos campos, preferiblemente en tu propia tabla de portal (`PortalTheme` o
   similar) para no tocar el modelo de Organization. Si por diseño necesitas guardarlos ahí,
   avisa a @sebastian antes de tocar `prisma/schema/org.prisma`.
4. Frontend: sección de edición en el panel de personalización + render en el portal público (un
   embed estático o imagen con pin basta para el mapa; no hace falta una librería pesada).
5. Pruebas de integración del nuevo endpoint/campo.
6. `pnpm turbo run lint typecheck build test` completo.
7. PR `feat(m14): personalización completa del portal individual`.
```

---

## Ola 2 — motor de dinero

### F-3 · M05 — Certificado de donación real (RF14)

**Por qué:** hoy es 100% mock — el propio código lo documenta (`"CERO backend... RF14 real es
post-pitch"` en `mock-certificate.ts`). El documento exige plantilla + hash SHA-256 + QR
verificable, firmado por el representante legal, solo para organizaciones ESAL con RTE.
**⚠️ Afectación cruzada:** necesitas la identidad y firma del representante legal — eso vive en
M01 (de Sebastián). **Antes de empezar**, pregúntale qué expone hoy `LegalRepresentative`/
`Signature` y si necesitas un campo o endpoint nuevo de solo lectura. Ver también S-1 en su
documento — si él construye esto primero, coordina el contrato con él.

```
Módulo M05 (tuyo, completo). Vas a construir el certificado de donación REAL (RF14),
reemplazando el mock actual en apps/web/src/features/certificates/.

Antes de escribir código: confirma con @sebastian qué expone hoy el módulo M01 sobre el
representante legal vigente de una organización y su firma (LegalRepresentative/Signature) —
necesitas LEER ese dato para estampar el certificado, no modificarlo. Si no existe un
endpoint/campo de solo lectura adecuado, pídele que lo publique como contrato aditivo antes de
que tú empieces a consumirlo.

Pasos:
1. Rama `feat/fab/m05-certificado-real`.
2. Sigue el patrón de hash ya usado en M04 (revisa cómo se calcula el hash del contrato de
   adopción) para el hash SHA-256 del certificado.
3. Nueva tabla de certificados con organization_id + RLS (ENABLE+FORCE+policy tenant_isolation,
   sigue el patrón de cualquier migración reciente de tu módulo).
4. Endpoint público de verificación (por código único) que NO expone información sensible, solo
   la validez del certificado — mismo patrón de "endpoint público acotado" que ya usa M14.
5. Gating: solo organizaciones con estado de formalidad ESAL + RTE pueden emitir (verifica ese
   campo de M01 — solo LECTURA, no lo modifiques).
6. QR real: que codifique la URL de verificación del certificado, no una URL fija como hoy.
7. Reemplaza el mock en `features/certificates` — quita `MOCK_CERTIFICATE` y conecta al backend.
8. Pruebas: generación, verificación pública, bloqueo si la organización no es ESAL-RTE, prueba
   de no-filtración (tabla nueva de negocio).
9. `pnpm turbo run lint typecheck build test` completo.
10. PR `feat(m05): certificado de donación real (RF14)`.

Es la tarea más grande del backlog. Si se vuelve muy grande, divídela en sub-PRs (backend
primero, frontend después) pero dilo explícitamente en el PR.
```

### F-4 · M15 — Dispersión T+1 vía Wompi Payouts

**Por qué:** es una de las dos decisiones de arquitectura que sostienen el modelo de negocio
(recaudo consolidado + dispersión T+1). Hoy `createPayout` lanza
`Error('WompiPaymentAdapter.createPayout is not implemented yet (M15b)')`. Sin esto, ninguna
organización recibe fondos reales.
**⚠️ Afectación cruzada:** avisa a Sebastián cuando esto quede mergeado — su dashboard
financiero (M13, Ola 3) probablemente necesita leer la tabla nueva de transacciones/payouts que
vas a crear.

```
Módulo M15 (tuyo, completo). Vas a implementar la pieza que falta del motor de pagos: dispersión
T+1 vía Wompi Payouts. El recaudo (M15a) ya está hecho en
apps/api/src/core/payments/wompi-payment.adapter.ts — el método `createPayout` hoy solo lanza el
error intencional citado arriba. Vas a implementarlo de verdad.

Pasos:
1. Rama `feat/fab/m15-wompi-payout`.
2. Implementa `createPayout` contra la API real de Wompi Payouts (/payouts individual y
   /payouts/file por lote, según la Consolidación operativa §4), con idempotencia — mismo patrón
   de idempotencyKey que ya usa el adaptador de recaudo.
3. Webhook de confirmación de payout, reintentos escalonados ante fallo (mismo patrón de
   reintentos ya usado en otros flujos del proyecto con BullMQ).
4. No custodies saldos: dispersa contra la cuenta bancaria registrada de cada organización.
5. Registra cada intento (éxito/fallo) en una tabla propia — esto alimentará el dashboard
   financiero que construirá Sebastián en M13.
6. Modelo de datos: crea las tablas que faltan en `prisma/schema/payments.prisma` (hoy solo
   tiene el comentario TODO) con organization_id + RLS.
7. Pruebas: idempotencia (dos intentos con la misma key no duplican el payout), fallo y
   reintento, no-filtración (tabla nueva).
8. `pnpm turbo run lint typecheck build test` completo.
9. PR `feat(m15): dispersión T+1 vía Wompi Payouts (M15b)`.
10. Avísale a @sebastian que esto ya está — él lo va a necesitar para RF28 en M13.
```

### F-5 · M15 — Conciliación

**Por qué:** completa el motor de dinero (RF26): cruzar lo recaudado contra lo dispersado.
**Depende de:** F-4 ya mergeado.
**⚠️ Afectación cruzada:** el endpoint/reporte que construyas aquí es exactamente lo que
Sebastián va a enchufar al dashboard financiero de Super Administración. Coordina el contrato del
endpoint con él antes de que él lo consuma.

```
Módulo M15 (tuyo). Construye la conciliación básica: un proceso (puede ser un endpoint de Super
Administración o un job programado) que cruce el total recaudado por Wompi Collections contra el
total dispersado por Payouts (F-4), por organización y por período, y marque diferencias para
revisión manual.

Pasos:
1. Rama `feat/fab/m15-conciliacion`.
2. Reporte simple: recaudado vs. dispersado vs. pendiente, por organización.
3. Publica esto como un contrato de solo lectura en `packages/contracts` — es el primer dato
   real que Sebastián enchufará al dashboard financiero (M13). Avísale cuando esté listo y
   revisen juntos la forma del contrato antes de que él construya su vista sobre él.
4. Pruebas de los cálculos con casos límite (montos parciales, dispersión fallida).
5. `pnpm turbo run lint typecheck build test` completo.
6. PR `feat(m15): conciliación de recaudo vs. dispersión`.
```

---

## Ola 3 — módulos nuevos completos

### F-6 · M09 — Banco de recursos

**Alcance (Consolidación operativa, M09):** publicar necesidades, ofrecer donaciones físicas,
coordinar entregas con evidencias. **Sin dependencias cruzadas.**

```
Módulo M09 completo, de cero (backend + frontend) — hoy solo existe el contrato vacío en
packages/contracts/src/resources.ts y prisma/schema/resources.prisma con un comentario TODO.

Pasos:
1. Rama `feat/fab/m09-banco-recursos`.
2. Contract-first: define el contrato en packages/contracts/src/resources.ts (necesidad, oferta,
   entrega) y publícalo antes de escribir el backend.
3. Modelo de datos en prisma/schema/resources.prisma: sigue el patrón de otra tabla de negocio ya
   construida (ej. Campaign) para organization_id + RLS + auditoría de cambios de estado.
4. Backend NestJS: nuevo módulo `apps/api/src/modules/resources/`, con @Roles en cada endpoint
   (deny-by-default), sigue el patrón de guards ya usado en donations/sponsorships.
5. Frontend: `apps/web/src/features/resources/`, con vista de organización (publicar necesidad) y
   vista pública/de donante (ofrecer, ver necesidades).
6. Registra la ruta en `shell/router/routes.tsx` y en el sidebar (`nav-items.ts`) — quita el
   estado "Próximamente" si existe uno para este módulo.
7. Pruebas: unitarias de reglas de negocio, integración de endpoints, no-filtración
   multi-organización (tabla de negocio nueva → gate obligatorio).
8. `pnpm turbo run lint typecheck build test` completo.
9. PR `feat(m09): banco de recursos — necesidades, ofertas y entregas`.
```

### F-7 · M10 — Marketplace simplificado

**Alcance:** catálogo de productos por organización con contacto por WhatsApp, sin carrito ni
pagos en línea, aviso de no garantía de entrega visible. **Sin dependencias cruzadas.**

```
Módulo M10 completo, de cero.

Pasos:
1. Rama `feat/fab/m10-marketplace`.
2. Contract-first en packages/contracts/src/marketplace.ts (producto: nombre, precio positivo,
   stock no negativo, categoría, imágenes, organization_id).
3. Modelo de datos con RLS en prisma/schema/marketplace.prisma.
4. Backend `apps/api/src/modules/marketplace/`: CRUD de producto por organización + listado
   público con filtro por categoría.
5. Frontend `apps/web/src/features/marketplace/`: gestión de productos (organización) + catálogo
   público con botón de contacto WhatsApp y el aviso de no garantía visible en cada producto.
6. Reglas de negocio: precio > 0, stock >= 0, prevención de duplicados (mismo nombre +
   organización).
7. Pruebas: reglas de negocio, integración, no-filtración.
8. `pnpm turbo run lint typecheck build test` completo.
9. PR `feat(m10): marketplace simplificado`.
```

### F-8 · M11 — Comunidad

**Alcance:** publicaciones (general/campaña/aviso/evento), comentarios, likes, filtros por tipo,
moderación básica, notificación por correo para publicaciones de campaña. **Usa el
NotificationPort que ya es tuyo (M15) — sin dependencias cruzadas con Sebastián.**

```
Módulo M11 completo, de cero.

Pasos:
1. Rama `feat/fab/m11-comunidad`.
2. Contract-first en packages/contracts/src/community.ts.
3. Modelo con RLS: Post, Comment, PostLike, con organization_id (o null si la publicación es de
   la plataforma en general — decide y documenta el criterio en el PR).
4. Backend `apps/api/src/modules/community/`: CRUD de publicaciones, comentarios, likes; endpoint
   de moderación restringido a roles Admin/SuperAdmin (mismo patrón de @Roles ya usado en otros
   módulos).
5. Frontend `apps/web/src/features/community/`: feed con filtros por tipo, formulario de
   publicación (10-2000 caracteres, imágenes JPEG/PNG hasta 5MB), comentarios y likes.
6. Si es una publicación de tipo campaña, dispara notificación por correo usando el
   NotificationPort ya existente — no reinventes el envío de correos.
7. Pruebas: reglas de negocio (límites de caracteres, formatos de imagen), integración,
   no-filtración si aplica organization_id.
8. `pnpm turbo run lint typecheck build test` completo.
9. PR `feat(m11): comunidad — publicaciones, comentarios y likes`.
```

---

## Resumen de afectaciones cruzadas a vigilar

| Actividad                             | Necesitas de Sebastián                     | Él necesita de ti                                      |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| F-3 (certificado real)                | Lectura de representante legal/firma (M01) | —                                                      |
| F-4/F-5 (Wompi payout + conciliación) | —                                          | Tabla de transacciones/payouts para su dashboard (M13) |
| Resto (F-1, F-2, F-6, F-7, F-8)       | Ninguna                                    | Ninguna                                                |

Todo lo demás: trabaja directo, sin pedir permiso.
