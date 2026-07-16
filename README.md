# AdoptaFácil V2.0 — Monorepo

Walking skeleton multi-tenant para AdoptaFácil. Este repositorio arranca de punta
a punta: la API responde `GET /health`, la web renderiza un shell que muestra ese
estado, hay Postgres + Redis locales, esquema Prisma dividido por módulo, y una CI
con todos los gates (incluido el de no-filtración entre organizaciones, RNF03).

> **Sprint 0 (bootstrap):** solo andamiaje. Sin lógica de negocio, sin auth real,
> sin integraciones externas reales (solo puertos/adaptadores simulables).

## Requisitos

| Herramienta | Versión          | Notas                                    |
| ----------- | ---------------- | ---------------------------------------- |
| Node.js     | 20 LTS           | ver `.nvmrc` / `.node-version`           |
| pnpm        | 11.x             | `npm i -g pnpm` o `corepack enable pnpm` |
| Docker      | Desktop / Engine | Postgres 16 + Redis 7 locales            |
| Git         | 2.x              | hooks (Husky), Conventional Commits      |

> **Windows:** Docker Desktop necesita **WSL2** (`wsl --install`, requiere reinicio)
> o Hyper-V como backend.

## Arranque rápido

```bash
# 1. Clonar e instalar
git clone <repo> && cd AdoptaFacil
pnpm install

# 2. Variables de entorno (no hay secretos reales; valores de ejemplo)
cp .env.example .env            # PowerShell: Copy-Item .env.example .env

# 3. Levantar infraestructura local (Postgres 16 + Redis 7)
docker compose up -d            # espera a que ambos estén "healthy"

# 4. Migrar la base de datos (crea tablas, policy RLS y rol de aplicación)
pnpm prisma migrate dev

# 5. Levantar API y web (en dos terminales, o con turbo en una)
pnpm --filter @adoptafacil/api dev     # http://localhost:3000/health
pnpm --filter @adoptafacil/web dev     # http://localhost:5173
# o todo junto:
pnpm dev
```

Al abrir `http://localhost:5173` deberías ver el shell mostrando `status: ok`,
`db: up`, `redis: up` (browser → API → Postgres/Redis).

## Scripts (raíz, orquestados por Turborepo)

| Comando                                           | Qué hace                            |
| ------------------------------------------------- | ----------------------------------- |
| `pnpm dev`                                        | Levanta api + web en modo watch     |
| `pnpm build`                                      | Compila todos los paquetes/apps     |
| `pnpm lint`                                       | ESLint en todo el monorepo          |
| `pnpm typecheck`                                  | `tsc --noEmit` en todo el monorepo  |
| `pnpm test`                                       | Pruebas unitarias (jest + vitest)   |
| `pnpm format`                                     | Prettier `--write`                  |
| `pnpm --filter @adoptafacil/api test:integration` | Smoke `/health` + RLS (requiere DB) |

## Estructura

```
adoptafacil/
├─ apps/
│  ├─ api/            NestJS 10 (health, prisma, redis/bullmq, notification port)
│  └─ web/            React 18 + Vite 5 (shell + cliente /health)
├─ packages/
│  ├─ contracts/      DTOs e interfaces (un archivo por módulo)
│  └─ ui/             Tailwind + shadcn/ui (componente Button de ejemplo)
├─ prisma/schema/     Esquema dividido por módulo (prismaSchemaFolder)
├─ docker-compose.yml Postgres 16 + Redis 7
└─ .github/           CI (gates + rls-no-leak), CODEOWNERS, PR template
```

## Multi-tenancy (RLS) y el gate RNF03

Toda tabla de negocio lleva `organization_id` y Row-Level Security. El patrón
canónico está probado sobre la tabla `_rls_probe` y el test
`apps/api/test/rls-no-leak.integration-spec.ts` verifica que una organización
**nunca** ve filas de otra (en ambos sentidos). Es un **gate obligatorio de CI**.
Detalles en [`prisma/README.md`](./prisma/README.md).

## Documentación

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — flujo trunk-based, ramas, commits,
  protocolo de migraciones, git worktrees.
- [`docs/CONTRACTS.md`](./docs/CONTRACTS.md) — registro vivo de contratos.
- [`docs/TASKS.md`](./docs/TASKS.md) — convención del tablero `T-###`.
- [`prisma/README.md`](./prisma/README.md) — esquema dividido y RLS.
