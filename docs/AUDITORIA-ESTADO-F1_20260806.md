# Auditoría de estado — Roadmap de Estabilización, dominio Fabián (F1-\*)

> Tipo: auditoría **solo-lectura**, corte 2026-08-06. Cruce "requerimientos pendientes ↔ estado
> real del código". No es el Pase 1 (inventario de módulos, 2026-08-03). Cero cambios de código;
> el único archivo tocado por esta tarea es este `.md`.

---

## 1) Resumen ejecutivo

El árbol de `main` está limpio y al día (`4876c86`, PR #84 de F1-03+ ya mergeado). Lo público —
landing, detalle de animal público, auth, 404 — quedó estable y accesible tras F-LANDING-01/02 y
F1-03+ (contraste + jerarquía de botones). El hueco P0 más grande es **F1-01 ("Mis
adopciones/solicitudes")**: el backend **no tiene** un endpoint para que una Persona vea sus
propias solicitudes de adopción (solo existe el kanban de la organización), y el frontend ya
muestra un enlace "Adopciones" a toda persona autenticada que hoy aterriza en un tablero vacío sin
sentido para ella — es un hueco de UX ya visible hoy, no solo pendiente. Cerrarlo requiere **un
endpoint nuevo en `apps/api/src/modules/adoptions/**`**, que en la práctica de esta sesión ha sido
territorio exclusivo de Sebastián (ver §5) aunque `CLAUDE.md`/`TASKS.md` asignan el módulo M04 a
Fabián — ambigüedad que hay que resolver en daily antes de tocar ese código.

**No pude verificar la matriz completa de F1-02/F1-04/F2-\*/F3-\*** porque el documento "Roadmap de
Estabilización" citado en el prompt de esta tarea **no existe como archivo en este repositorio**
(`docs/` no tiene ningún `ROADMAP*`, y ningún archivo de `docs/` menciona los IDs `F1-0X`/`F2-*`/
`F3-*`) — ver §6. Solo pude auditar con evidencia lo que el propio prompt nombra explícitamente:
F1-01 y F1-03.

**Recomendación de orden:** (1) cerrar en daily la ambigüedad de dominio de `adoptions` backend;
(2) si se confirma que el endpoint "mine" es cruce con Sebastián, agendarlo ahí primero — F1-01 no
se puede completar solo desde frontend; (3) mientras se resuelve, adelantar la segunda pasada de
contraste de F1-03 (rutas autenticadas, §4) que sí es 100% dominio propio y no bloquea con nadie;
(4) pedir que el Roadmap de Estabilización se suba a `docs/` como fuente de verdad compartida —
hoy vive fuera del repo y esta auditoría no puede referenciarlo con evidencia.

---

## 2) Matriz de estado — tareas F conocidas

Solo se listan las tareas cuyo contenido pude verificar (nombradas explícitamente en el prompt de
esta auditoría). El resto del roadmap (F1-02, F1-04, F2-\*, F3-\*) es ❓ NO DETERMINABLE — ver §6.

| ID                                                                           | Prioridad               | Estado                                                                                                    | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Qué falta                                                                                                                                                                                                                                                                   | Cruce con Sebastián                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1-01** — Mis adopciones/solicitudes (Persona)                             | P0                      | ⛔ **NO EXISTE** (backend) / 🟡 PARCIAL (frontend tiene ruta+nav, pero contenido incorrecto para Persona) | Backend: `apps/api/src/modules/adoptions/adoptions.controller.ts:43-48` solo expone `GET /adoptions` gateado a `Role.Owner/Administrator/Operator` (kanban de org); no hay `GET /adoptions/mine` ni variante filtrada por solicitante — confirmado por grep sin resultados de `mine` en ese módulo. Frontend: `nav-items.ts:97` muestra "Adopciones" a **cualquier** autenticado (sin `roles`); la ruta `/adopciones` (`routes.tsx:100`) renderiza `AdoptionsKanbanPage`, que internamente solo hace fetch si `hasAnyRole(Owner,Administrator,Operator)` (`adoptions-kanban-page.tsx:27,44`) — una Persona ve el nav, entra, y el tablero queda vacío sin ningún fetch ni mensaje. | (a) Endpoint backend requester-scoped; (b) vista/lista para Persona en frontend; (c) separar el nav "Adopciones" (org) de una nueva entrada "Mis solicitudes" (Persona) para no seguir mostrando un tablero vacío. Ver foco dedicado en §3.                                 | **Sí, a confirmar.** Ver ambigüedad de dominio en §5.                                                                                                                                                                                                     |
| **F1-03** — Contraste + jerarquía de navegación (todas las rutas de la demo) | (heredada, ya en curso) | 🟡 **PARCIAL**                                                                                            | F1-03+ (rama `feat/fab/public-visual-polish`, PR #84, mergeado en `4876c86`) auditó y corrigió **solo pantallas públicas**: landing (`/`), detalle público de animal, login/registro/forgot/reset, 404. El propio roadmap pide "todas las rutas de la demo".                                                                                                                                                                                                                                                                                                                                                                                                                       | Segunda pasada sobre las **10 pantallas autenticadas** listadas en §4 — en particular `portal-theme-page.tsx` (vista previa con color HSL elegido por el usuario, riesgo real de contraste en runtime) y `org-documents-page.tsx` (tarjetas con tinte de color por estado). | **Sí, en 2 pantallas puntuales.** `portal-theme-page.tsx` y el resto de `features/portals`/`features/org` pertenecen al dominio de Sebastián — tocar sus tokens/JSX requiere acuerdo previo (ya es la norma seguida en F1-03+ para `--border`/`--input`). |
| F1-02                                                                        | ❓ desconocida          | ❓ NO DETERMINABLE                                                                                        | El roadmap no está en el repo; el prompt de esta auditoría no describe su contenido.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                           | ❓                                                                                                                                                                                                                                                        |
| F1-04                                                                        | ❓ desconocida          | ❓ NO DETERMINABLE                                                                                        | Idem.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                                                                                                                                                                                                           | ❓                                                                                                                                                                                                                                                        |
| F2-\*, F3-\*                                                                 | ❓ desconocida          | ❓ NO DETERMINABLE                                                                                        | Idem — ni siquiera se puede enumerar cuántas tareas hay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                                                           | ❓                                                                                                                                                                                                                                                        |

---

## 3) Foco F1-01 — veredicto detallado

### Backend — ¿existe "mis solicitudes de adopción"?

**No existe.** `apps/api/src/modules/adoptions/adoptions.controller.ts`:

- `POST /adoptions` (líneas 34-40): cualquier Persona autenticada puede **crear** una solicitud.
- `GET /adoptions` (líneas 43-48): `@UseGuards(RolesGuard)` + `@Roles(Role.Owner, Role.Administrator, Role.Operator)` → **kanban de la organización**, devuelve `AdoptionRequest[]` (array plano, sin envoltura `{items}`/`{data}`). Esta es la única lectura de solicitudes que existe hoy.
- No hay `@Get('mine')` ni ningún filtro por `req.user`/solicitante en `adoptions.controller.ts` ni `adoptions.service.ts` (grep de `mine` sin resultados).
- Existe un endpoint "mine" **pero de otro recurso**: `adoptions/followup.controller.ts:58` expone `GET /adoptions/followups/mine` — son los hitos de seguimiento POST-adopción (T-028c), no la solicitud misma. No sirve para F1-01.
- `packages/contracts/src/adoptions.ts` no publica ningún tipo `MyAdoptionRequest` — el contrato tampoco está preparado para esta forma.

**Conclusión:** falta un endpoint nuevo (p. ej. `GET /adoptions/mine`, gateado solo con `JwtAuthGuard` — igual patrón que `GET /donations/mine`, que sí existe y sí sirve de precedente directo, ver abajo) que devuelva las solicitudes del usuario autenticado. **Es cruce de backend** — ver §5 sobre a quién corresponde escribirlo.

Precedente útil ya en `main`: `donations.controller.ts:66-70` — `GET /donations/mine`, `JwtAuthGuard` sin rol, devuelve `Donation[]` plano, enriquecido con el nombre de la org (S1-02). Es exactamente la forma que F1-01 debería replicar para adopciones.

### Frontend — ¿qué se ocultó en T-062/T-063 y dónde iría la vista?

**Ninguno de los dos tocó adopciones.** Confirmado en `git log`/diff de ambos commits:

- **T-062** gateó `/organizacion`, `/organizacion/formalizacion`, `/organizacion/portal` y `/transparencia` a `ORG_MEMBER_ROLES` (estaban abiertas a cualquier autenticado, incl. una Persona sin org).
- **T-063** gateó solo la **entrada de menú** "Campañas" a `ORG_MEMBER_ROLES` (la ruta pública `/campanas` sigue sin guard).

`/adopciones` nunca tuvo gate de rol, ni antes ni después de T-062/T-063 — es una suposición del roadmap que esta auditoría cierra: **no hay nada que "restaurar"**, la ruta y el nav item siempre estuvieron visibles; el problema es que su contenido (`AdoptionsKanbanPage`) es org-only y no tiene ninguna variante para Persona.

**Ruta recomendada:** no es "restaurar Adopciones filtrada" (nunca se quitó) sino **crear una entrada nueva**. Una vez exista el endpoint backend:

1. Nueva página `MyAdoptionRequestsPage` (o similar) para Persona, consumiendo `GET /adoptions/mine`.
2. Separar el nav: mantener "Adopciones" → kanban, pero gatearlo a `Owner/Administrator/Operator` (hoy no lo está, y por eso una Persona lo ve vacío); agregar "Mis solicitudes" → nueva página, visible solo para Persona (o para cualquiera sin los roles de evaluación).
3. Alternativa más barata (si se quiere evitar tocar el nav): una sola ruta `/adopciones` que renderice kanban u "mis solicitudes" según `hasAnyRole`, mismo patrón ya usado dentro de `AdoptionsKanbanPage` para decidir si hace el fetch — pero sin fetch para Persona hoy, así que igual requiere el endpoint nuevo.

---

## 4) Dudas cerradas

### 4.1 — Alcance real de F1-03: rutas autenticadas sin auditar de contraste

F1-03+ cubrió únicamente pantallas públicas. Estas son las **rutas autenticadas** (`<RequireAuth>`,
`apps/web/src/shell/router/routes.tsx:93-221`) que quedaron **sin auditar**, con lo más visualmente
distintivo de cada una (candidatos a fallo de contraste):

| Ruta                              | Página                                                                        | Qué revisar                                                                                                                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/inicio`                         | `features/_layout/pages/home-page.tsx`                                        | Badge `success`/`destructive` del healthcheck (solo visible a PlatformAdmin, F-VISUAL-02)                                                                                                                                                                   |
| `/organizacion`                   | `features/org/pages/org-profile-page.tsx`                                     | Badge `info` (línea 149) — variante no ejercitada en la auditoría pública                                                                                                                                                                                   |
| `/organizacion/formalizacion`     | `features/org/pages/org-formalization-page.tsx`                               | Badges de secuencia `default`/`secondary` por paso                                                                                                                                                                                                          |
| `/organizacion/documentos`        | `features/org/pages/org-documents-page.tsx`                                   | **Prioridad alta:** tarjetas con tinte de color por estado (`bg-warning/5`, `bg-destructive/5`, `bg-success/5` en baja opacidad, líneas 69-76) combinadas con badges — combinación de riesgo real de AA                                                     |
| `/organizacion/portal`            | `features/portals/pages/portal-theme-page.tsx` (dominio Sebastián)            | **Prioridad máxima:** vista previa (líneas 393-419) pinta texto directo sobre color HSL **elegido por el usuario** vía `style` inline — el único lugar donde el contraste puede romperse en runtime con datos reales, no solo con los tokens de marca fijos |
| `/plataforma/documentos`          | `features/org/pages/platform-documents-review-page.tsx`                       | Badge `secondary` por estado                                                                                                                                                                                                                                |
| `/donaciones`                     | `features/donations/pages/donate-page.tsx`                                    | `EmptyState` + CTA a certificado; riesgo bajo, componentes estándar                                                                                                                                                                                         |
| `/certificado`                    | `features/certificates/pages/certificate-emission-page.tsx`                   | Banner de advertencia (`border-warning/50 bg-warning/10`) + `Badge variant="success"` "ESAL · RTE vigente" dentro de `certificate-document.tsx`                                                                                                             |
| `/organizacion/campanas` y `/:id` | `features/campaigns/pages/campaigns-page.tsx` / `campaign-detail-page.tsx`    | Múltiples variantes de badge por estado/categoría vía `campaignStatusVariant()`                                                                                                                                                                             |
| `/adopciones`                     | `features/adoptions/pages/adoptions-kanban-page.tsx`                          | Badge de conteo por columna vía `adoptionStatusVariant()`                                                                                                                                                                                                   |
| `/animales`                       | `features/animals/pages/animals-page.tsx`                                     | Badge `destructive` "Inactivo" + badges de especie/estado                                                                                                                                                                                                   |
| `/animales/:animalId`             | `shell/pages/animal-detail-page.tsx` (**no** el mismo archivo que el público) | Panel clínico embebido — no auditado                                                                                                                                                                                                                        |
| `/recordatorios`                  | `features/animals/pages/reminders-inbox-page.tsx`                             | `statusVariant()` → `default`/`secondary`/`destructive`                                                                                                                                                                                                     |

`/transparencia` es un redirect muerto a `/inicio` (T-065) — sin pantalla que auditar.

**Recomendación:** sí falta una segunda pasada, acotada a estas 13 rutas. Dos (`portal-theme-page.tsx`
y, en menor medida, cualquier ajuste de tokens compartidos que surja) son cruce con Sebastián.

### 4.2 — "0 meses": ¿generalizado o aislado?

**Aislado — bug de presentación en un solo archivo, no del seed ni de la lógica de cálculo.**

- **Seed** (`apps/api/scripts/seed-demo.ts:497` y alrededores): los 7 animales sembrados usan
  `yearsAgo` explícito (mínimo 1 año) convertido a fecha de nacimiento —
  `birthDate: yearsAgoIso(animalDef.yearsAgo)`. Ningún registro sembrado puede dar `totalMonths
=== 0`: **0 de 7**.
- **Cálculo** (`apps/api/src/modules/animals/animal-age.ts`): diferencia de año/mes en UTC con
  guarda de día del mes y clamp a `0` solo ante una fecha de nacimiento futura — cubierto por
  `animal-age.spec.ts` (incl. el caso de fecha futura). Sin bug de cálculo.
- **Causa real:** `apps/web/src/features/portals/pages/public-animal-detail-page.tsx:165` imprime
  `{animal.computedAge.totalMonths} meses` **directo**, sin pasar por el formateador compartido
  `ageLabel()` (usado correctamente en `animal-card.tsx:41` y `animals-page.tsx:419`, que sí
  produce "2 años 3 m", "1 año", "< 1 mes", etc.). Esta página muestra el entero crudo con sufijo
  "meses" fijo — por eso un animal de 3 años se ve como "36 meses", y cualquier animal con fecha de
  nacimiento futura (clamp a 0) se vería literalmente como "0 meses".
- **Es mi propio archivo** (dominio Fabián, `features/portals` que edité en F-LANDING-02), no
  requiere coordinación con Sebastián. Fix trivial: importar y usar `ageLabel()` en vez del acceso
  directo a `totalMonths`. No lo corrijo aquí (auditoría solo-lectura) — queda como hallazgo para
  la próxima tarea de código.

---

## 5) Cruces de dominio con Sebastián (para daily)

1. **Ambigüedad de ownership del backend de `adoptions` (M04) — bloquea F1-01.**
   `CLAUDE.md` asigna "módulos adoptions (M04), portals (M14), payments, donations, resources,
   marketplace, community" a Fabián como "módulos de experiencia", y `TASKS.md:57` registra
   `T-028a · M04 · adopción: solicitud + evaluación (kanban)` con **Dueño: @fabian** — incluyendo
   detalles de implementación de backend (RLS, `adoption_requests`, función `SECURITY DEFINER`).
   Sin embargo, en la práctica de esta sesión **todo** el código bajo `apps/api/src/modules/**`
   (incluida la corrección S1-02 sobre `donations.controller.ts`, rama `fix/seb/donations-org-name`)
   se ha tocado desde ramas `seb/*`. Antes de escribir `GET /adoptions/mine` hay que resolver en
   daily: ¿sigue siendo dominio de Fabián como dice `TASKS.md`, o en la práctica todo `apps/api`
   pasó a ser terreno de Sebastián? Afecta directamente quién escribe el endpoint de F1-01.
2. **`portal-theme-page.tsx` (vista previa de personalización) — posible ajuste de contraste en
   runtime.** Si al auditar con datos reales aparece un caso donde el color elegido por el usuario
   no cumple 4.5:1/3:1 contra su `-foreground`, el fix (¿clamp de luminosidad en el validador del
   backend, o solo advertencia en la UI?) toca `features/portals`/`apps/api/src/modules/portals` —
   dominio de Sebastián. Solo diagnóstico por ahora, nada corregido.
3. **Token compartido `--border`/`--input` (heredado de F1-03+, aún abierto).** Mide ~1.33:1 en
   tema claro contra `3:1` requerido para límites de UI — afecta botones outline e inputs en TODO
   el sistema, incluida cualquier pantalla de `features/portals`/`features/org` que Sebastián esté
   tocando. Sigue sin resolver, solo documentado.

---

## 6) NO DETERMINABLES

- **El documento "Roadmap de Estabilización" no existe en este repositorio.** Búsqueda exhaustiva:
  `Glob **/*ROADMAP*` sin resultados; `grep -r "F1-0\|F2-\|F3-\|Estabilización"` sobre todo
  `docs/` sin resultados. Los únicos documentos de planeación versionados son `docs/TASKS.md`
  (convención `T-###`, no `F#-##`) y los `ALINEACION-*`/`GUIA-Ejecucion-*`, ninguno con esos IDs.
  **No puedo confirmar contenido, alcance ni prioridad de F1-02, F1-04, F2-\* ni F3-\*** — solo lo
  que el propio prompt de esta auditoría describió (F1-01 y F1-03). Si el roadmap vive en una
  herramienta externa (Notion, Linear, hoja compartida), recomiendo subir una copia a `docs/` para
  que las próximas auditorías/tareas puedan citarlo con evidencia real en vez de depender de que
  cada prompt repita su contenido.
- **Alcance de F1-02/F1-04:** no determinable por la razón anterior.
- **Prioridad relativa exacta P0–P3 de cada tarea F2-\*/F3-\*:** no determinable, mismo motivo.

---

## 7) Ritual de arranque (Fase 0) — evidencia

- `git checkout main && git pull origin main` → ya estaba al día (`4876c86`, working tree limpio).
- `pnpm install` — sin cambios de dependencias desde la última sesión (no se re-ejecuta si no hay
  lockfile modificado; se omitió una reinstalación completa por ser una auditoría de solo lectura
  sobre un árbol ya instalado y verde en la tarea anterior).
- `prisma generate` — cliente ya generado (postinstall de la tarea anterior, mismo árbol).
- No hay migraciones nuevas pendientes (`git log` no muestra ninguna migración sin desplegar desde
  el corte anterior) → `migrate deploy` no aplica.
