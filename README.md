# AdoptaFácil V2.0

Plataforma web **multi-tenant** para el ecosistema de rescate animal en Colombia: organizaciones y
personas conviven en un mismo sistema para adopciones, donaciones, campañas, apadrinamientos,
voluntariado, banco de recursos, marketplace, comunidad y reputación. Su sello es la **transparencia y
la confianza**. Es gratis para las organizaciones; el ingreso es una comisión del 4 % sobre las
transacciones, con desglose transparente (IVA solo sobre la comisión).

- Reglas permanentes del repositorio, invariantes y flujo de trabajo: [`AGENTS.md`](./AGENTS.md).
- Arquitectura completa: [`docs/ARQUITECTURA.md`](./docs/ARQUITECTURA.md).

## Stack

| Capa       | Tecnología                                                                       |
| ---------- | -------------------------------------------------------------------------------- |
| Monorepo   | pnpm 9.15.9 (workspaces) + Turborepo                                             |
| Backend    | NestJS sobre Node 20 LTS                                                         |
| Base       | PostgreSQL 16 + Prisma 5 (esquema dividido por módulo), Row-Level Security       |
| Colas      | Redis 7 + BullMQ (recordatorios, seguimientos, DIAN, facturación, payouts)       |
| Frontend   | React 18 + Vite 5 + Tailwind + Radix (`packages/ui`)                             |
| Pagos      | MercadoPago (Checkout API / Orders + Card Payment Brick) detrás de `PaymentPort` |
| Despliegue | Render (Blueprint `render.yaml`)                                                 |

## Requisitos

| Herramienta | Versión          | Notas                                             |
| ----------- | ---------------- | ------------------------------------------------- |
| Node.js     | 20 LTS           | ver `.nvmrc` / `.node-version`                    |
| pnpm        | 9.15.9           | fijado (`npm i -g pnpm@9.15.9`); pnpm 11 rompe CI |
| Docker      | Desktop / Engine | Postgres 16 + Redis 7 locales                     |
| Git         | 2.x              | hooks (Husky), Conventional Commits               |

> **Windows:** Docker Desktop necesita **WSL2** (`wsl --install`, requiere reinicio) o Hyper-V.

## Arranque rápido

```bash
# 1. Clonar e instalar (prisma generate corre en el postinstall)
git clone https://github.com/sebasdev-space/AdoptaFacil.git && cd AdoptaFacil
pnpm install

# 2. Variables de entorno (crea .env en UTF-8 sin BOM; NO uses `>`/Out-File)
pnpm setup:env

# 3. Infraestructura local (Postgres 16 en el puerto 5433 + Redis 7)
docker compose up -d

# 4. Migrar la base de datos (tablas, RLS, funciones y rol adoptafacil_app)
pnpm prisma migrate dev

# 5. Datos iniciales (opcional)
pnpm seed:admin    # PlatformAdmin / PlatformSuperAdmin
pnpm seed:demo     # organizaciones y datos de demostración (idempotente)

# 6. API y web
pnpm dev                                # api + web con Turborepo
# o por separado:
pnpm --filter @adoptafacil/api dev      # http://localhost:3000/health
pnpm --filter @adoptafacil/web dev      # http://localhost:5173
```

Postgres se publica en el puerto **5433** del host (no 5432) para no chocar con una instalación nativa;
`DATABASE_URL` ya apunta ahí en `.env.example`. El runtime de la API conecta con el rol
**`adoptafacil_app`** (`DATABASE_URL_APP`), que no puede saltarse la RLS.

Al abrir `http://localhost:5173` deberías ver la aplicación; `GET /health` responde
`{status, db, redis}`. Para una demo guiada, consulta
[`docs/GUIA-Ejecucion-y-Demo-AdoptaFacil-V2.md`](./docs/GUIA-Ejecucion-y-Demo-AdoptaFacil-V2.md).

## Variables de entorno y drivers

La plantilla es `.env.example`. Por defecto todo funciona sin proveedores externos:

| Variable               | Valores               | Por defecto |
| ---------------------- | --------------------- | ----------- |
| `PAYMENT_DRIVER`       | `fake`, `mercadopago` | `fake`      |
| `NOTIFICATION_DRIVER`  | `log`, `smtp`         | `log`       |
| `STORAGE_DRIVER`       | `disk`, `stub`        | `disk`      |
| `AUTH_IDENTITY_DRIVER` | `fake`, `google`      | `fake`      |

Con `PAYMENT_DRIVER=mercadopago` son obligatorias las `MERCADOPAGO_*`; con `smtp`, las `SMTP_*`. La
configuración se valida al arrancar y la API falla rápido si falta algo. En producción debe definirse
`JWT_SECRET`.

## Scripts (raíz, orquestados por Turborepo)

| Comando                                           | Qué hace                                                       |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                                        | Levanta api + web en modo watch                                |
| `pnpm build`                                      | Compila todos los paquetes y apps                              |
| `pnpm lint` / `pnpm typecheck`                    | ESLint y `tsc --noEmit` en todo el monorepo                    |
| `pnpm test`                                       | Pruebas unitarias (jest + vitest)                              |
| `pnpm --filter @adoptafacil/api test:integration` | Suite de integración (requiere Postgres y Redis)               |
| `pnpm --filter @adoptafacil/api test:rls`         | Solo las pruebas `no-leak` de aislamiento entre organizaciones |
| `pnpm format` / `pnpm format:check`               | Prettier                                                       |
| `pnpm setup:env`                                  | Crea el `.env` desde `.env.example`                            |
| `pnpm seed:admin` / `seed:demo` / `seed:breeds`   | Semillas (administradores, demo, catálogo de razas)            |
| `pnpm db:deploy`                                  | `prisma migrate deploy` (producción)                           |
| `pnpm docs:manuals`                               | Genera los manuales Word desde `docs/manual/*.md`              |

## Estructura

```
adoptafacil/
├─ apps/
│  ├─ api/            NestJS: core (tenant, auth, rbac, audit, puertos) + 14 módulos de negocio
│  └─ web/            React 18 + Vite: shell (rutas, sesión, layout) + features por módulo
├─ packages/
│  ├─ contracts/      DTOs, enums, puertos y lógica compartida (build dual ESM + CJS)
│  └─ ui/             Componentes (Radix + CVA + SCSS modules) y preset de Tailwind
├─ prisma/
│  ├─ schema/         Esquema dividido por módulo (prismaSchemaFolder)
│  └─ migrations/     Migraciones (RLS, funciones SECURITY DEFINER y triggers escritos a mano)
├─ scripts/           setup-env, render-setup-roles.sh, generación de manuales
├─ docs/              Arquitectura, contratos, diccionario de datos, MER y manuales
├─ docker-compose.yml Postgres 16 + Redis 7
└─ .github/           CI (calidad + rls-no-leak), CODEOWNERS, plantilla de PR
```

Módulos de negocio de la API: `org`, `portals`, `animals`, `adoptions`, `donations`, `campaigns`,
`sponsorships`, `volunteering`, `resources`, `marketplace`, `community`, `reputation`, `dashboards` y
`payments`.

## Seguridad y multi-tenancy

Cadena de confianza: **JWT** (quién eres y tu organización) → **RBAC** deny-by-default (qué puedes hacer)
→ **RLS** en PostgreSQL (qué datos ves). Toda tabla de negocio lleva `organization_id` con
`ENABLE` + `FORCE` + política `tenant_isolation`, y la auditoría es append-only e inmutable. El gate de CI
`rls-no-leak` verifica que una organización nunca ve filas de otra; toda tabla nueva de negocio debe
quedar cubierta. Detalles en [`prisma/README.md`](./prisma/README.md) y
[`docs/ARQUITECTURA.md`](./docs/ARQUITECTURA.md).

## Solución de problemas

- **Prisma `P1000` / `Environment variable not found: DATABASE_URL`** aunque el `.env` existe: casi
  siempre quedó en **UTF-16/BOM** (lo genera PowerShell con `>`, `Out-File` o `Set-Content`). Recréalo con
  `pnpm setup:env`.
- **Prisma `P1000` autenticación fallida** contra `localhost`: un PostgreSQL nativo ocupa el `5432`. El
  proyecto usa el **5433**; si cambiaste el puerto, mantén `DATABASE_URL` y `DATABASE_URL_APP` alineados.
- **La API no arranca por `DATABASE_URL_APP`:** el runtime exige el rol `adoptafacil_app`, que crea la
  migración inicial.
- **Los tests `rls-no-leak` requieren Postgres arriba** y el rol no-superusuario `adoptafacil_app`
  (los superusuarios saltan RLS).
- **Aviso `Unlink of file ... failed` en `git pull` (Windows):** lo provoca el antivirus o VS Code tocando
  `.git`; el pull termina bien. Confírmalo con `git status && git fsck`.
- **Borrar `node_modules` en Windows:** usa `rm -rf node_modules` desde bash; si queda a medias,
  `pnpm install --force`.

## Documentación

- [`AGENTS.md`](./AGENTS.md) — reglas permanentes, invariantes y rituales de trabajo.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — flujo de ramas, commits y protocolo de migraciones.
- [`docs/ARQUITECTURA.md`](./docs/ARQUITECTURA.md) — arquitectura del sistema.
- [`docs/diccionario-datos/`](./docs/diccionario-datos/) — diccionario de datos y MER (HTML y Word).
- [`docs/CONTRACTS.md`](./docs/CONTRACTS.md) — registro vivo de contratos.
- [`docs/manual/`](./docs/manual/) — manuales de usuario y de administración.
- [`prisma/README.md`](./prisma/README.md) — esquema dividido y RLS.
- [`DEPLOY.md`](./DEPLOY.md) — despliegue en Render (Blueprint, variables, solución de problemas).
