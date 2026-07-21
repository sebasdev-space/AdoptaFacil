# Nota de decisión de fronteras — M01 (org) ↔ M14 (portales)

**Para:** @sebastian · **De:** @fabian · **Fecha:** 2026-07-21
**Objetivo:** acordar en el daily los límites de ownership entre el perfil/formalización
de organización (M01) y el portal público rico (M14), antes de abrir ramas.
**Estado:** propuesta — pendiente de aprobación. No se ha tocado código ni `CODEOWNERS`.

## Contexto (estado actual del repo)

- [apps/web/src/features/org/](apps/web/src/features/org/) **no tiene regla propia** en
  `.github/CODEOWNERS`; hoy cae bajo el default `* @sebastian @fabian` → **ownership
  compartido de facto**. Conviven ahí piezas de dos dominios:
  - M01 (@sebastian): `org-profile-form.tsx`, `profile-fields.tsx`, `org-profile-page.tsx`,
    `org-formalization-page.tsx`, `validation.ts`.
  - "Portal público": [org-public-page.tsx](apps/web/src/features/org/pages/org-public-page.tsx),
    la pantalla `/o/:slug`.
- El backend ya está separado por dominio: `/apps/api/src/modules/org/ @sebastian` y
  `/apps/api/src/modules/portals/ @fabian`.
- La pantalla pública ya consume `GET /public/organizations/:slug` y pinta la proyección
  `OrganizationPublic` (contrato `packages/contracts/src/org.ts`, tuyo) en una sola `Card`.
- El router vive en [apps/web/src/shell/router/routes.tsx](apps/web/src/shell/router/routes.tsx)
  (no en `shell/routes.tsx`), y **ya es mío** vía la regla `/apps/web/src/shell/ @fabian`.

---

## 1 · Ownership de `features/org/` — la pantalla pública pasa a M14

**Propuesta.** Sacar la pantalla del **portal público** (`/o/:slug`) del dominio de M01 y
asignarla a M14: mover [org-public-page.tsx](apps/web/src/features/org/pages/org-public-page.tsx)
a un nuevo `apps/web/src/features/portals/` (owner @fabian). El **CRUD de perfil** y la
**formalización** (`org-profile-*`, `org-formalization-*`, `validation.ts`) se quedan en
`features/org/` como M01 (@sebastian).

**Justificación por dominio.** El perfil y la formalización son _escritura autenticada del
dueño de la organización_ → M01. La página `/o/:slug` es _lectura pública sin sesión, cara
al visitante_ → es exactamente el dominio de portales (M14), y su gemelo de backend
(`modules/portals/`) ya es mío. Dejarla en `features/org/` mantiene el default compartido y
nos obliga a co-revisar cada cambio de portal. Separarla alinea el frontend con la frontera
que el backend ya respeta.

> Nota de ejecución (post-aprobación): al mover el archivo hay que actualizar el `export`
> de [features/org/index.ts](apps/web/src/features/org/index.ts) y el import en `routes.tsx`.
> Ese re-cableado de ruta lo hago yo (ver punto 3).

## 2 · Destino de `/o/:slug` — M14 **extiende**, no monta un portal paralelo

**Propuesta.** M14 **compone sobre** la `org-public-page` existente: su `Card` actual pasa a
ser la **sección "perfil"** de un portal más rico (animales, campañas, transparencia, etc.).
No se levanta una segunda pantalla pública paralela ni se duplica el fetch.

**Justificación por dominio.** El portal rico es agregación multi-dominio (M14), pero el
bloque de identidad de la organización es proyección de M01. La forma correcta es
**consumir tu contrato**: sigo llamando `GET /public/organizations/:slug` y renderizando
`OrganizationPublic`. **No reimplemento tu backend** ni copio tu proyección. Así, si cambias
los campos públicos, mi sección "perfil" hereda el cambio por contrato en vez de divergir.

## 3 · Ownership de `routes.tsx` — mío, integro las rutas nuevas

**Propuesta.** El router (`shell/router/routes.tsx`) es mío por la regla `/apps/web/src/shell/`.
Acordamos que **las rutas nuevas las integro yo**, y **consolido tu edición previa**: las
líneas M01 que hoy viven en el router (`organizacion`, `organizacion/formalizacion`, y el
`<Route path="/o/:slug">`) quedan bajo mi cuidado en cuanto a _cableado_, aunque los
**componentes de página** detrás sigan siendo tuyos (M01).

**Justificación por dominio.** El árbol de rutas es infraestructura de shell (composición,
guard `RequireAuth`, layout) → un solo dueño evita conflictos de merge en un archivo que
todos tocan. Tú sigues siendo dueño de _qué_ renderiza cada ruta de M01; yo soy dueño de
_dónde y cómo_ se enganchan en el árbol.

## 4 · Actualización concreta de `CODEOWNERS`

Añadir a la sección _Frontend_ de `.github/CODEOWNERS` (last-match-wins; van **después** del
default `*` y de la regla `shell/`):

```diff
  # --- Frontend shell & shared UI library ----------------------------------
  /apps/web/src/shell/                 @fabian
  /packages/ui/                        @fabian
+
+ # --- Frontend por dominio (M01 perfil/formalización vs M14 portales) ------
+ /apps/web/src/features/org/          @sebastian
+ /apps/web/src/features/portals/      @fabian
```

**Efecto.** `features/org/` deja de ser compartido y queda explícito como M01 (@sebastian);
`features/portals/` nace como M14 (@fabian). El router no necesita línea nueva: ya está
cubierto por `/apps/web/src/shell/`.

---

## Decisiones a aprobar en el daily

- [ ] **1.** `/o/:slug` (`org-public-page`) se mueve a `features/portals/` (M14 · @fabian);
      `org-profile-*` / `org-formalization-*` quedan en `features/org/` (M01 · @sebastian).
- [ ] **2.** M14 **extiende** la card pública como sección "perfil" y consume
      `GET /public/organizations/:slug`; @fabian **no** reimplementa el backend de org.
- [ ] **3.** `routes.tsx` es de @fabian; integra rutas nuevas y consolida el cableado M01.
- [ ] **4.** Se aplican las dos reglas nuevas en `CODEOWNERS`.

**Al aprobar:** abrimos las tareas de ejecución (mover archivo + re-export + import, y el PR
de `CODEOWNERS`). Hasta entonces, nada de esto toca código.
