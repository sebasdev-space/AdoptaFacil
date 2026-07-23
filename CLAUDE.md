# CLAUDE.md — AdoptaFácil V2.0

> Reglas permanentes del repositorio. Léelas al inicio de cada tarea y respétalas SIEMPRE,
> aunque el prompt de la tarea no las repita. El estado del sprint y la tarea en curso NO viven
> aquí (van en el handoff y en cada Prompt Spec); este archivo solo contiene lo que casi nunca cambia.

---

## Qué es el proyecto

Plataforma web **multi-tenant** para el ecosistema de rescate animal en Colombia: muchas
organizaciones y personas conviven en un mismo sistema para adopciones, donaciones, campañas,
apadrinamientos, voluntariado y más. Sello distintivo: **transparencia y confianza**. Gratis para
organizaciones; ingreso por comisión sobre transacciones (4% con desglose transparente; IVA solo
sobre la comisión). Pasarela **Wompi**: recaudo consolidado + **dispersión T+1** (sin split en checkout).

**Jerarquía de fuentes de verdad** (gana el de más arriba): (1) Documento base (requisitos y
roadmap) → (2) Consolidación operativa → (3) Metodología → (4) Instructivo del desarrollador →
(5) Wireframes (solo referencia visual, **NO normativos**).

---

## Invariantes NO NEGOCIABLES (aplican a toda tarea)

1. **Multi-tenant + RLS.** Toda tabla de negocio lleva `organization_id` y tiene RLS
   (`ENABLE` + `FORCE` + policy `tenant_isolation`). El runtime conecta como el rol
   **no-superusuario `adoptafacil_app`** (no puede saltarse la RLS). El gate de CI
   `rls-no-leak` es obligatorio: cualquier tabla nueva de negocio debe quedar cubierta por él.
   Nunca uses `select *` ni vías que evadan la RLS; si necesitas exposición pública o cross-tenant
   controlada, usa una función acotada `SECURITY DEFINER` que exponga SOLO las columnas necesarias.
2. **RBAC deny-by-default.** Ante la duda, 403. Se evalúa SIEMPRE junto con el tenant (un admin de
   la Org A no manda en la Org B). Declara los roles de cada endpoint con `@Roles` a medida.
3. **Auditoría append-only e inmutable** (reforzada en DB con `REVOKE UPDATE/DELETE/TRUNCATE` +
   triggers que abortan la mutación incluso para superusuario), vía `AuditService`. **Nunca**
   registres datos sensibles en claro.
4. **Tiempo:** UTC en auditoría y almacenamiento; **hora Colombia solo en presentación (UI)**.
5. **Integraciones detrás de puertos simulables:** `StoragePort` (archivos), `NotificationPort`
   (correos), `PaymentPort` (pagos). En Ola 1 son stubs, sin proveedor real.
6. **Contratos aditivos:** enriquecer nunca rompe la forma ya publicada en `packages/contracts`.
7. **Roles con los nombres del DOCUMENTO BASE, no de los wireframes.**
   Org: Owner, Administrator, Operator, Volunteer, TemporaryCollaborator, Veterinarian,
   ReadOnlyAuditor. Plataforma: PlatformAdmin, PlatformSuperAdmin.
8. **No inventes requisitos de negocio** que el documento base no fija (p. ej. qué documentos gatean
   una formalización): déjalos **parametrizables con `TODO(client)`**.

> Cadena de seguridad: JWT (quién eres + tu org) → RBAC (qué puedes hacer) → RLS (qué datos ves).

---

## Stack

- **Monorepo:** pnpm workspaces + Turborepo. Paquetes: `apps/api`, `apps/web`,
  `packages/contracts`, `packages/ui`.
- **Backend:** NestJS sobre Node 20 LTS.
- **BD:** PostgreSQL 16 + Prisma (esquema dividido por módulo en `prisma/schema/*.prisma`).
- **Frontend:** React 18 + Vite + Tailwind + shadcn/ui.
- **Colas/caché:** Redis 7 + BullMQ (aún por cablear; recordatorios, correos, dispersiones).
- **Infra local:** Docker (Postgres + Redis).
- **`packages/contracts`:** se compila **dual ESM + CJS** (la api consume CJS vía `require`; el web
  consume ESM para importar valores como `Role`). No romper esta configuración.

---

## División de dominios (dos desarrolladores en paralelo, sin pisarse)

**Sebastián — "Registros y confianza" (core + backend):**
`apps/api/src/core/**` (tenant, auth, rbac, audit), `apps/api/src/modules/{org,animals,...}/**`,
`apps/web/src/features/{org,animals,...}/**`, `prisma/schema/org.prisma` (y sus esquemas de módulo),
`packages/contracts/src/{org,auth,audit,animals}.ts`.
Módulos: M01 (organizaciones), M03 (animales+clínico); luego M06/M07, M08/M12/M13.

**Fabián — frontend shell + módulos de experiencia:**
`apps/web/shell/**`, `packages/ui/**`, y módulos adoptions (M04), portals (M14), payments,
donations, resources, marketplace, community.

**Reglas de frontera:**

- No edites el dominio del otro. Si necesitas un componente de `packages/ui`, pídeselo a Fabián;
  mientras tanto, versión **feature-local temporal** y déjalo anotado como TODO.
- **Infra compartida (acuerdo/revisión cruzada):** `turbo.json` raíz, `package.json` raíz,
  `.github/workflows/**`, y la config de build de `packages/contracts`.

---

## Rituales de trabajo

- **Una rama por tarea** (`feat/seb/<modulo>-<slice>` o `chore/seb/<tema>`), **un PR por tarea**,
  revisión cruzada de Fabián, merge **Squash** solo con CI verde + aprobación.
- **`main` protegido:** nunca escribir directo; solo por PR.
- **Ritual git entre tareas:** `git checkout main && git pull origin main` → borrar rama mergeada
  → `git checkout -b <nueva rama>`.
- **Token de migración:** como ambos tocan el esquema Prisma, ANTES de `pnpm prisma migrate dev`
  hay que avisar a Fabián y confirmar que no haya otra migración en vuelo. **Una migración por PR.**
- **Contract-first:** publica los contratos temprano para desbloquear al otro; cámbialos **solo de
  forma aditiva**.
- **Conventional Commits** (validado por hook Husky). Ej.: `feat(auth): T-011 ...`. Commit desde la
  terminal donde `pnpm -v` responde.
- **Repo:** `github.com/sebasdev-space/AdoptaFacil`. `gh` NO está instalado → los PRs se abren por la web.
- **Definición de Hecho:** invariantes cumplidos, contratos aditivos estables, `typecheck` verde,
  tests verdes (incl. no-filtración `rls-no-leak`), 1 migración por PR, CI verde, revisión aprobada.

---

## Entorno (Windows) — problemas conocidos

- **Node 20 LTS** (vía fnm) + **pnpm 9.15.9** (fijados). No usar otras versiones.
- Puerto de Postgres del proyecto: **5433**.
- Aviso `Unlink of file ... failed` en `git pull`: es el antivirus/VS Code tocando `.git`; el pull
  termina bien igual. Confirmar con `git status && git fsck` (los "dangling commit" son inofensivos).
- Borrado del store de pnpm: usar `rm -rf node_modules` desde bash (PowerShell falla con symlinks
  profundos); si algo queda a medias, `pnpm install --force`.
- `prisma generate` corre en el **postinstall** de la raíz: un clon + `pnpm install` deja el cliente
  generado.

---

## Formato de reporte al terminar una tarea

Al cerrar una tarea, entrega un reporte con: **resumen en 5 líneas** + **tabla de checklist**
(✅/⚠️/❌ con evidencia `archivo:línea`) + **pendientes/riesgos** antes del PR. No hagas merge
directo a `main`: abre PR para revisión cruzada.
