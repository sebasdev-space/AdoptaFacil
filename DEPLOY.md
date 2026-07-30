# Despliegue en Render (T-D06)

Guía para publicar AdoptaFácil en Render usando el Blueprint [`render.yaml`](./render.yaml)
(4 servicios: Postgres, Redis, API, Web). Pensada para que fundaciones reales puedan
registrarse cuanto antes — no requiere Docker ni infraestructura propia.

## Prerrequisitos

- Cuenta en [Render](https://render.com).
- El repo (`github.com/sebasdev-space/AdoptaFacil`) accesible desde esa cuenta
  (Render pide autorización de GitHub la primera vez).
- Rama a desplegar mergeada a `main` (Render construye desde ahí).

## 1. Crear el Blueprint

1. Dashboard de Render → **New** → **Blueprint**.
2. Selecciona el repo `AdoptaFacil` → rama `main`. Render detecta `render.yaml` y
   propone 4 servicios: `adoptafacil-db` (Postgres), `adoptafacil-redis`,
   `adoptafacil-api`, `adoptafacil-web`.
3. Antes de **Apply**, Render te deja llenar las env vars marcadas `sync: false`.
   **En esta primera pasada, déjalas vacías salvo `DATABASE_URL_APP`** (ver
   paso 2 — las demás dependen de URLs que Render todavía no asignó).
4. `Apply`. Render aprovisiona la base y el Redis, y hace el primer build/deploy
   de API y Web. El API probablemente arrancará en estado "degraded" en
   `/health` (db/redis `down`) porque el rol `adoptafacil_app` aún no existe —
   es esperado, se corrige en el paso 3.

## 2. Construir `DATABASE_URL_APP`

La API se conecta en runtime como el rol **no-superusuario** `adoptafacil_app`
(no como el owner) para que RLS se aplique de verdad (`prisma.service.ts`).
Ese rol lo crea la migración inicial (`prisma/migrations/20260716051053_init/
migration.sql`) con `CREATE ROLE adoptafacil_app LOGIN PASSWORD 'adoptafacil_app'
NOSUPERUSER NOBYPASSRLS` — Render no lo conoce, así que hay que armar la cadena
a mano:

1. Dashboard → `adoptafacil-db` → copia el **Internal Database URL**
   (algo como `postgresql://adoptafacil:<password>@<host>/adoptafacil`).
2. Reemplaza `adoptafacil:<password>` por `adoptafacil_app:adoptafacil_app`
   (usuario y contraseña que crea la migración), dejando el mismo host/puerto/
   nombre de base y cualquier `?sslmode=...` que traiga.
3. Pega el resultado en `DATABASE_URL_APP` del servicio `adoptafacil-api`.

**Riesgo de seguridad a tener en cuenta:** esa contraseña (`adoptafacil_app`)
está hardcodeada en texto plano en el SQL de la migración (heredada de dev/CI,
donde no importa). Para producción real con datos de fundaciones, rota la
contraseña después del primer `db:deploy` (paso 4):

```sql
-- Desde el Shell de Render (psql) o cualquier cliente conectado como owner:
ALTER ROLE adoptafacil_app WITH PASSWORD '<contraseña-fuerte-nueva>';
```

y actualiza `DATABASE_URL_APP` con la contraseña nueva (dispara un redeploy
automático del API). Esto NO toca la migración (cero migraciones nuevas, tal
como pide la tarea) — es un ajuste operativo posterior.

## 3. Resolver las URLs públicas (segunda pasada de env vars)

Render asigna las URLs (`https://<nombre-del-servicio>.onrender.com`) recién en
el primer deploy — por eso no se pueden precompletar en `render.yaml`. Con los
4 servicios ya arriba:

1. Copia la URL pública de `adoptafacil-api` (ej. `https://adoptafacil-api.onrender.com`)
   y de `adoptafacil-web` (ej. `https://adoptafacil-web.onrender.com`) desde el
   dashboard.
2. En `adoptafacil-api`, llena:
   - `API_CORS_ORIGIN` = URL pública de **adoptafacil-web**.
   - `WEB_BASE_URL` = la misma URL de **adoptafacil-web** (se usa para armar el
     link de "restablecer contraseña" en los correos).
   - `STORAGE_PUBLIC_BASE_URL` = URL pública de **adoptafacil-api** (la de sí
     mismo — así resuelve las URLs de descarga de documentos/fotos).
3. En `adoptafacil-web`, llena:
   - `VITE_API_URL` = URL pública de **adoptafacil-api**.
4. Guardar cada env var redeploya el servicio automáticamente.

## 4. Migrar y sembrar datos iniciales

Con `DATABASE_URL_APP` ya configurado (paso 2):

1. Dashboard → `adoptafacil-api` → **Shell**.
2. `pnpm db:deploy` — corre `prisma migrate deploy`: crea todas las tablas,
   las policies RLS y el rol `adoptafacil_app` (una sola vez; migraciones
   futuras se corren igual, manualmente, nunca en el `buildCommand`).
3. `pnpm seed:admin` — crea el PlatformAdmin inicial.
4. `pnpm seed:demo` — datos de demo (opcional, útil para la demo del 30 de julio).
5. Confirma en `https://<tu-api>.onrender.com/health` que responde
   `{"status":"ok","db":"up","redis":"up"}`.

## 5. Logs y troubleshooting

- **Logs:** dashboard → el servicio → pestaña **Logs** (build y runtime
  separados). `Events` muestra el historial de deploys.
- **Prisma / binarios:** si ves `Error loading shared library` o
  `PrismaClientInitializationError` sobre el query engine, confirma que
  `prisma/schema/schema.prisma` tiene `binaryTargets = ["native",
"debian-openssl-3.0.x"]` (Render corre sobre Debian) y que el build corrió
  `pnpm prisma generate` DESPUÉS de `pnpm install` (el `buildCommand` del
  Blueprint ya lo hace en orden).
- **CORS (`blocked by CORS policy` en la consola del navegador):** revisa que
  `API_CORS_ORIGIN` en `adoptafacil-api` sea EXACTAMENTE la URL pública de
  `adoptafacil-web` (sin slash final, con `https://`). Si sirves un dominio
  propio más adelante, agrégalo separado por coma.
- **Storage (imágenes/documentos rotos):** confirma `STORAGE_PUBLIC_BASE_URL`
  = URL pública de la propia API, y que el Persistent Disk (`adoptafacil-storage`,
  montado en `/var/data/storage`) sigue asociado al servicio — si se recrea el
  servicio sin el disco, los archivos subidos antes se pierden.
- **`--frozen-lockfile` falla en el build:** el lockfile quedó desactualizado.
  Corre `pnpm install` local, comitea `pnpm-lock.yaml`, vuelve a desplegar.
- **`prisma: command not found` / `husky: command not found` / `nest: command
not found` durante el build (T-D07):** pnpm salta TODAS las devDependencies
  cuando `NODE_ENV=production` está en el entorno (confirmado: `adoptafacil-api`
  lo declara como env var, y Render la expone también durante el build, no solo
  en runtime) — pero `prisma`, `@nestjs/cli`, `typescript` y `husky` son
  devDependencies. El `buildCommand` del Blueprint ya incluye `--prod=false`
  para forzar su instalación durante el build; si copias el comando a mano
  (fuera del Blueprint) no olvides ese flag.
- **Build falla por memoria/timeout:** el plan `starter` del API suele alcanzar;
  si el build de `apps/web` (Vite) se queda sin memoria, sube el plan del
  static site temporalmente durante el build (Render permite build en plan
  distinto al de runtime en algunos casos) o repórtalo — no es algo que este
  Blueprint pueda resolver solo.

## 6. Variables de entorno

| Variable                            | Servicio | Descripción                                                | Cómo se llena                                      |
| ----------------------------------- | -------- | ---------------------------------------------------------- | -------------------------------------------------- |
| `DATABASE_URL`                      | api      | Connection string del owner (migraciones)                  | Auto (`fromDatabase`)                              |
| `DATABASE_URL_APP`                  | api      | Connection string del rol `adoptafacil_app` (runtime, RLS) | Manual — ver paso 2                                |
| `REDIS_URL`                         | api      | Connection string de Redis (BullMQ)                        | Auto (`fromService`)                               |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | api      | Secretos de firma de tokens                                | Auto (`generateValue`)                             |
| `API_CORS_ORIGIN`                   | api      | Origen(es) permitidos por CORS (coma-separado)             | Manual — ver paso 3                                |
| `WEB_BASE_URL`                      | api      | URL pública del frontend (link de reset de contraseña)     | Manual — ver paso 3                                |
| `STORAGE_DRIVER`                    | api      | Adaptador de `StoragePort`                                 | Fijo: `disk`                                       |
| `STORAGE_DISK_ROOT`                 | api      | Carpeta del Persistent Disk                                | Fijo: `/var/data/storage`                          |
| `STORAGE_PUBLIC_BASE_URL`           | api      | URL pública de la propia API (arma URLs de descarga)       | Manual — ver paso 3                                |
| `NOTIFICATION_DRIVER`               | api      | Adaptador de `NotificationPort`                            | `log` (default) o `smtp`                           |
| `SMTP_HOST/PORT/USER/PASS/FROM`     | api      | Credenciales SMTP reales                                   | Manual, solo si `NOTIFICATION_DRIVER=smtp`         |
| `PAYMENT_DRIVER`                    | api      | Adaptador de `PaymentPort`                                 | Fijo: `fake` (Wompi real es M15, fuera de alcance) |
| `VITE_API_URL`                      | web      | URL pública de la API                                      | Manual — ver paso 3                                |
| `NODE_VERSION`                      | ambos    | Versión de Node                                            | Fijo: `20`                                         |

## 7. Fuera de alcance de este Blueprint

- **Escalar a más de una instancia del API**: el Persistent Disk de Render no
  se comparte entre instancias — con `STORAGE_DRIVER=disk` los archivos solo
  serían visibles en la instancia que los recibió. Migrar a un `StoragePort`
  real (S3/R2) es directo gracias a la abstracción existente, pero es trabajo
  aparte (`TODO(client)`).
- **`PAYMENT_DRIVER=wompi`**: agregado a la tabla de variables por completitud;
  activarlo es de M15, no de esta tarea.
- **Dominio propio / TLS custom**: Render lo soporta desde el dashboard del
  servicio `adoptafacil-web` (y `adoptafacil-api` si aplica), no es parte de
  este Blueprint.
