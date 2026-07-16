<!-- Conventional Commits en el título del PR, p. ej. `feat(animals): ...` -->

## Tarea

- **ID de tarea:** T-###
- **Módulo / Ola:**
- **Resumen:**

## Alcance de archivos tocados

<!-- Lista los directorios/archivos modificados. Deben caer dentro de tu propiedad
     (ver CODEOWNERS). Si tocas algo fuera, explícalo abajo. -->

-

## Checklist (Definición de Hecho)

- [ ] El título sigue **Conventional Commits**.
- [ ] Los cambios están dentro de mi **alcance de propiedad** (CODEOWNERS).
- [ ] `pnpm turbo lint typecheck build test` pasa localmente.
- [ ] Rebasé sobre `main` antes de abrir el PR.
- [ ] Actualicé documentación relevante (README / CONTRIBUTING / docs).

## Contratos

- [ ] **NO** toqué un contrato publicado (`packages/contracts`), **o**
- [ ] Toqué un contrato y lo registré en [`docs/CONTRACTS.md`](../docs/CONTRACTS.md)
      y avisé a los consumidores afectados.

## Multi-tenancy / RLS (RNF03)

- [ ] No introduje tablas de negocio, **o**
- [ ] Toda tabla nueva lleva `organization_id` + RLS (`ENABLE` + `FORCE` + policy).
- [ ] Incluyo el **test de no-filtración entre organizaciones** para mis tablas
      (réplica de `apps/api/test/rls-no-leak.integration-spec.ts`).

## Migraciones

- [ ] No incluyo migraciones, **o**
- [ ] Incluyo **una sola** migración, tomé el “token de migración” y rebasé antes.
