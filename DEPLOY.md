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

## 2. Construir `DATABASE_URL_APP` (rotar password + restaurar FORCE RLS)

La API se conecta en runtime como el rol **no-superusuario** `adoptafacil_app`
(no como el owner) para que RLS se aplique de verdad (`prisma.service.ts`).
Ese rol lo crea la migración inicial (`prisma/migrations/20260716051053_init/
migration.sql`) con `CREATE ROLE adoptafacil_app LOGIN PASSWORD 'adoptafacil_app'
NOSUPERUSER NOBYPASSRLS` — password hardcodeada (heredada de dev/CI, donde no
importa) que **hay que rotar** antes de usar la base con datos reales.

> ⚠️ **Antes de seguir, lee "Hallazgo S1-01" más abajo.** Restaurar FORCE ROW
> LEVEL SECURITY sin verificar primero que el owner de la base pueda saltar
> RLS (BYPASSRLS) puede romper TODOS los endpoints `/public/*` (catálogo de
> adopción, perfiles públicos de organización, campañas, apadrinamientos...) y
> `pnpm seed:admin`. El script de abajo verifica esto automáticamente y se
> detiene sin tocar nada si no puede garantizarlo — pero si eso pasa, **no lo
> fuerces manualmente** sin antes leer esa sección.

Usa `scripts/render-setup-roles.sh` (S1-01) en vez de construir la cadena a
mano — rota el password, verifica que el owner pueda saltar RLS, restaura
`FORCE ROW LEVEL SECURITY` en todas las tablas con policy `tenant_isolation`
(las descubre dinámicamente, no hay lista que mantener), y verifica la
conexión como `adoptafacil_app` antes de imprimir el `DATABASE_URL_APP` listo
para pegar:

1. Dashboard → `adoptafacil-api` → **Shell** (o cualquier shell con `pnpm` y
   Node apuntando a la base, parado en la raíz del repo).
2. Diagnóstico rápido, de solo lectura, antes de correr nada (confirma si el
   Hallazgo S1-01 aplica a tu instancia de Render):
   ```bash
   echo "SELECT rolname, rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = current_user;" \
     | pnpm exec prisma db execute --stdin --url="$DATABASE_URL"
   ```
   Si `rolsuper` y `rolbypassrls` son `f` (false) para el owner, el script del
   paso 3 se va a detener en el paso "3/5" — es esperado, sigue en "Hallazgo
   S1-01" antes de continuar.
3. Corre el script con un password fuerte y nuevo (nunca el hardcodeado de la
   migración):
   ```bash
   ADOPTAFACIL_APP_PASSWORD='<password-fuerte-nueva>' ./scripts/render-setup-roles.sh
   ```
4. Si termina con éxito, copia el `DATABASE_URL_APP` que imprime al final y
   pégalo en el servicio `adoptafacil-api` (dispara un redeploy automático).

El script es idempotente (correrlo dos veces no falla ni rompe nada) y no
toca ninguna migración — es un ajuste operativo, tal como pide la tarea.

### Hallazgo S1-01: por qué el workaround actual (`NO FORCE` + `DATABASE_URL_APP=DATABASE_URL`) existe, y qué se necesita para revertirlo con seguridad

**Cómo funcionan los endpoints públicos hoy:** el catálogo de adopción público,
los perfiles públicos de organización, las campañas públicas, la rendición de
cuentas pública, el resumen público de apadrinamiento, etc. (todos bajo
`*.controller.ts` con rutas `/public/*` o similares — ver
`public-animals.service.ts`, `public-campaigns.service.ts`,
`org-profile.service.ts`, entre ~10 módulos) **no filtran por tenant en la
capa de la app**: llaman a funciones `SECURITY DEFINER` de Postgres (p. ej.
`public_org_adoptable_animals`, `organization_public`, `public_campaigns`)
que resuelven la organización por slug/id y consultan directamente las tablas
protegidas por RLS. Esto es intencional y está documentado en cada migración
(`prisma/migrations/.../migration.sql`, buscar `SECURITY DEFINER`) — es el
patrón "excepción controlada a RLS" en vez de un `SELECT *` sin filtro.

**Por qué eso funciona en local/CI pero es frágil en Render:** una función
`SECURITY DEFINER` corre con los privilegios de su **owner** (quien ejecutó la
migración, vía `DATABASE_URL`) — y en Postgres, el owner de una tabla **salta
RLS automáticamente, a menos que la tabla tenga `FORCE`**. En local/CI,
`DATABASE_URL` conecta como `adoptafacil` (docker-compose), que es el usuario
`POSTGRES_USER` de la imagen oficial `postgres:16` → es **superusuario real**,
y un superusuario salta RLS **siempre**, con o sin `FORCE`. Por eso todo
funciona ahí incluso con `FORCE` puesto desde el día 1. `pnpm seed:admin`
tiene el mismo patrón a propósito (`apps/api/scripts/seed-platform-admin.ts`,
comentario: _"Superuser connection (bypasses RLS)"_) — crea el PlatformAdmin
conectando directo por `DATABASE_URL`, sin pasar por `withOrgContext`.

En Render, el owner de la base (`adoptafacil`) **casi con certeza no es un
superusuario real** (los proveedores de Postgres administrado no lo dan, por
seguridad del control plane) — es un rol con `CREATEROLE`/`CREATEDB` pero sin
`SUPERUSER` ni `BYPASSRLS`. Verificado empíricamente contra Postgres 16.14 (la
misma versión que corre Render) con un rol simulado idéntico: con `FORCE`
puesto, ese tipo de owner **sí queda sujeto a RLS**, así que las funciones
`SECURITY DEFINER` (que corren como él) y `pnpm seed:admin` (que conecta como
él) dejan de ver/escribir filas — no con un error, sino devolviendo 0 filas o
fallando el `WITH CHECK` de la policy en silencio. Esto es, con alta
probabilidad, lo que forzó el workaround actual: alguien restauró
funcionalidad rápido bajo presión desactivando `FORCE` en todas las tablas
(en vez de resolver la causa real) y apuntando `DATABASE_URL_APP` al owner.

**El fix correcto — y su bloqueo verificado:** el owner necesita el atributo
`BYPASSRLS` (equivalente a lo que ya tiene "gratis" el superusuario local) para
que las funciones `SECURITY DEFINER` y `pnpm seed:admin` sigan funcionando una
vez restaurado `FORCE`. `scripts/render-setup-roles.sh` intenta
`ALTER ROLE <owner> BYPASSRLS` automáticamente antes de tocar `FORCE`, y
**aborta sin cambiar nada si falla**. Probado contra Postgres 16.14 con un rol
`CREATEROLE`/`CREATEDB` sin `SUPERUSER` (el mismo perfil que se espera del
owner de Render): el intento de auto-concederse `BYPASSRLS` fallar con
`permission denied to alter role` — **solo un superusuario puede otorgar
`BYPASSRLS`**, ni siquiera `CREATEROLE` alcanza (endurecido así desde
Postgres 16). No se pudo verificar contra la instancia real de Render (sin
acceso), así que esto queda como **condición de parada real**, no una
suposición: el diagnóstico del paso 2 de arriba confirma si aplica.

Si el script se detiene en el paso "3/5" (`No se pudo otorgar BYPASSRLS...`),
las opciones son:

- **Opción A (probar primero, sin código):** pedirle a soporte de Render que
  otorgue `BYPASSRLS` al usuario owner de `adoptafacil-db` (algunos
  proveedores administrados sí atienden este tipo de solicitud puntual vía
  soporte). Cero cambios de código si funciona.
- **Opción B (garantizada, pero requiere una migración nueva — fuera de
  alcance de S1-01):** en vez de depender de que el owner salte RLS por
  privilegio, hacer que cada función `SECURITY DEFINER` pública fije
  explícitamente `app.current_org_id` para la organización que ya resolvió
  (p. ej. `PERFORM set_config('app.current_org_id', v_org::text, true);` justo
  después de resolver `v_org` en `public_org_adoptable_animals`,
  `organization_public`, `public_campaigns`, etc. — mismo mecanismo que usa
  `PrismaService.withOrgContext`), y ajustar `seed-platform-admin.ts` para
  envolver su transacción con el mismo `set_config`. Esto hace que la policy
  `tenant_isolation` se cumpla por sí sola, sin depender de si el owner puede
  saltar RLS — funciona igual en local, CI y Render. Queda **TODO(client)**
  como tarea de seguimiento si la Opción A no es viable.

**Mientras tanto:** el workaround actual (inseguro, pero funcional) sigue
activo — este script no lo toca si no puede garantizar que restaurar `FORCE`
no rompa nada. No lo fuerces manualmente sin haber resuelto la Opción A o B.

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
3. `pnpm seed:admin` — crea el PlatformAdmin inicial. **Depende del mismo fix
   de "Hallazgo S1-01" (paso 2):** este script conecta como el owner
   (`DATABASE_URL`) a propósito para saltarse RLS al crear el primer usuario
   (`apps/api/scripts/seed-platform-admin.ts`) — si `FORCE` está restaurado
   pero el owner no tiene `BYPASSRLS`, este comando fallará igual que los
   endpoints `/public/*`. No es un problema nuevo de `seed:admin`: es el mismo
   bloqueo, así que se resuelve solo una vez.
4. `pnpm seed:demo` — datos de demo (opcional). No tiene esta dependencia: usa
   los servicios reales de Nest vía `withOrgContext` (el rol de app,
   tenant-scoped), igual que cualquier request autenticado — funciona con
   `FORCE` puesto sin necesitar `BYPASSRLS` en nadie. Por esto no hace falta un
   script separado que desactive/reactive RLS para sembrar (se evaluó y se
   descartó en S1-01: sería trabajo extra sin beneficio).
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
- **Endpoints `/public/*` devuelven 404/vacío o `pnpm seed:admin` falla
  después de restaurar `FORCE ROW LEVEL SECURITY` (S1-01):** el owner de la
  base necesita el atributo `BYPASSRLS` para que las funciones
  `SECURITY DEFINER` públicas y `seed:admin` sigan funcionando bajo `FORCE` —
  ver "Hallazgo S1-01" en la sección 2. Si `scripts/render-setup-roles.sh` se
  detuvo en el paso "3/5", esto es exactamente lo que habría pasado si se
  hubiera forzado igual; no se aplicó ningún cambio.
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
