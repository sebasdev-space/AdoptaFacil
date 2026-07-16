# Guía de contribución — AdoptaFácil

## Flujo de trabajo: trunk-based

- `main` siempre desplegable. **Nunca** se hace push directo a `main`.
- Todo cambio entra por **Pull Request** con **revisión cruzada** (el otro
  desarrollador aprueba) y CI en verde.
- Ramas de vida corta con el formato:

  ```
  feat/<dev>/<modulo>-<slice>
  # ejemplos:
  feat/sebastian/animals-crud
  fix/fabian/adoptions-status
  chore/<dev>/<tema>
  ```

## Conventional Commits

El título del PR y los commits siguen [Conventional Commits](https://www.conventionalcommits.org/).
`commitlint` lo valida en el hook `commit-msg`.

```
feat(animals): agregar registro de fichas
fix(adoptions): corregir estado inicial
chore(ci): añadir gate rls-no-leak
```

Tipos permitidos: `build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test`.

## Antes de cada commit

Husky ejecuta automáticamente:

- `pre-commit` → `lint-staged` (ESLint `--fix` + Prettier sobre lo staged).
- `commit-msg` → `commitlint`.

Localmente valida el conjunto completo antes de abrir PR:

```bash
pnpm turbo run lint typecheck build test
```

## Propiedad de código (CODEOWNERS)

Cada módulo tiene dueño (ver [`.github/CODEOWNERS`](./.github/CODEOWNERS)). Edita
**solo** archivos dentro de tu propiedad. Los stubs por módulo
(`prisma/schema/*.prisma`, `packages/contracts/src/*.ts`) están separados para que
cada quien edite el suyo sin conflictos.

## Protocolo de migraciones (¡importante!)

Las migraciones de Prisma son una fuente frecuente de conflictos. Reglas:

1. **Una sola migración por PR.**
2. **Token de migración:** antes de generar una migración, avisa en el canal del
   equipo y confirma que nadie más está migrando. Solo una migración “en vuelo”.
3. **Rebase antes:** haz `git fetch && git rebase origin/main` justo antes de
   generar/commitear la migración para que quede al final de la cadena.
4. La migración va **commiteada** en el PR (`prisma/migrations/**`); la CI aplica
   `prisma migrate deploy`.
5. Toda tabla nueva: `organization_id` + RLS (`ENABLE` + `FORCE` + policy) + su
   test de no-filtración (réplica de `rls-no-leak.integration-spec.ts`).

## Trabajo en paralelo con git worktrees

Para trabajar en varias ramas sin pisar el árbol principal:

```bash
git worktree add ../adoptafacil-animals feat/sebastian/animals-crud
cd ../adoptafacil-animals && pnpm install
# ... trabajar ...
git worktree remove ../adoptafacil-animals   # al terminar
```

## Contratos publicados

Si modificas `packages/contracts`, regístralo en [`docs/CONTRACTS.md`](./docs/CONTRACTS.md)
y avisa a los consumidores. Un contrato publicado es una interfaz estable: los
cambios que rompan requieren coordinación.

## Configuración de rama protegida (una vez, por el lead)

En GitHub → Settings → Branches → `main`:

- Requerir PR antes de merge (mínimo **1 aprobación**).
- Requerir status checks: `quality` y `rls-no-leak`.
- Requerir revisión de **Code Owners**.
- Prohibir push directo / force-push a `main`.
