# AdoptaFácil V2.0 — Guía de ejecución y demo

> **Para:** levantar el proyecto localmente, probarlo, y mostrar el estado actual al cliente.
> **Corte:** 26-jul-2026 (Ola 2 en curso).
> **⚠️ Verificar antes de usar:** los nombres exactos de scripts (`pnpm ...`) y puertos deben confirmarse contra el `package.json` y el `README` reales del repo. Esta guía se basa en el setup del Sprint 0 y en el entorno usado durante el desarrollo; si algún comando difiere, manda el §7 (prompt de verificación) a Claude Code para generar un README autoritativo.

---

## 1. Requisitos previos

- **Node 20** (fijado; versiones más nuevas dieron problemas en CI).
- **pnpm 9.15.9** (fijado; pnpm 11 rompía CI). Instalar la versión exacta: `npm i -g pnpm@9.15.9`.
- **Docker** (para Postgres 16 y Redis 7).
- **Git**.

---

## 2. Puesta en marcha (primera vez)

```bash
# 1. Clonar y entrar
git clone <url-del-repo> AdoptaFacil
cd AdoptaFacil

# 2. Instalar dependencias (prisma generate corre por postinstall)
pnpm install

# 3. Preparar variables de entorno
pnpm setup:env          # ⚠️ confirmar el nombre real del script
#   Genera/copia el .env. Si falla, copiar a mano el .env.example a .env.
#   Nota histórica: cuidar encoding del .env (UTF-16/BOM dio problemas).

# 4. Levantar Postgres 16 + Redis 7 en Docker
docker compose up -d    # ⚠️ confirmar que existe docker-compose en el repo
#   En dev, Postgres se usó en el puerto 5433 (para no chocar con un Postgres nativo en 5432).

# 5. Aplicar migraciones a la base
pnpm prisma migrate deploy   # ⚠️ confirmar el script exacto (puede ser un alias del monorepo)

# 6. (Opcional) Regenerar el cliente Prisma si hubo cambios de schema
pnpm prisma generate
```

---

## 3. Levantar la aplicación

```bash
# API (backend) — corre en el puerto 3000
pnpm --filter @adoptafacil/api dev      # ⚠️ confirmar nombre del script (dev/start:dev)

# Web (frontend) — corre en el puerto 5173 (Vite)
pnpm --filter @adoptafacil/web dev
```

- **API:** http://localhost:3000 — health check en `/health` (debe responder `ok`).
- **Web:** http://localhost:5173

> Alternativa: puede existir un script raíz que levante todo con Turborepo (`pnpm dev`). Confirmar en `package.json`.

---

## 4. Verificar que todo está sano

```bash
# Suite completa (mismo comando del CI). --force evita falsos verdes por caché.
pnpm turbo run test --force

# Estado esperado (corte 26-jul): typecheck · lint · build · test verdes.
```

Si `typecheck` sale rojo tras un `git pull` con migraciones nuevas: **no es un bug**, es el cliente Prisma desactualizado. Correr `pnpm install` o `pnpm prisma generate` y recompilar.

---

## 5. Recorrido de demo para el cliente (qué mostrar, en orden)

Esto muestra lo construido de forma narrativa. Lo **funcional real** y las **maquetas** están marcadas.

1. **Registro / Login** — crear una Persona y una Organización. _(Funcional)_
2. **Portal público de una organización** (`/o/:slug`) — perfil, indicador de transparencia con datos reales (nivel de verificación + % de formalización), personalización por tokens, y el **badge de tipo de organización**. _(Funcional)_
3. **Catálogo público de adopción** — sección "Mascotas en adopción" en el portal, detalle público del animal (sin datos clínicos), botón "Solicitar adopción". _(Funcional)_
4. **Flujo de adopción** — solicitud autenticada (mensaje ≥ 50), kanban de evaluación de la organización, contrato con firma electrónica e inmutabilidad, seguimiento post-adopción. _(Funcional)_
5. **Donación con transparencia** (el P1 estrella del pitch) — desde el portal, botón "Donar" → **desglose transparente antes de pagar** (comisión 4%, pasarela, IVA, neto que recibe la org) → casilla **"cubro la comisión"** (el donante decide si el 100% llega) → **recibo automático**. _(Funcional)_
6. **Flujo de confianza del certificado** — desde el recibo, "Ver tu certificado" → emisión → código único + QR → verificación pública → evidencia de autenticidad. _(Maqueta — marcada "vista de diseño"; el motor real es post-pitch)_
7. **Panel de organización (shell autenticado)** — documentos y verificación, animales, expediente clínico, recordatorios de vacunas. _(Funcional)_

> **Honestidad de la demo:** las pantallas del paso 6 llevan la etiqueta "vista de diseño". El resto es funcional real. Conviene decirlo explícito al cliente para transmitir confianza.

---

## 6. Solución de problemas (los que ya nos pasaron)

| Síntoma                                                     | Causa                              | Solución                                                       |
| ----------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `typecheck` rojo tras un pull                               | Cliente Prisma stale               | `pnpm install` o `pnpm prisma generate`                        |
| CI falla en "Initialize containers" (`docker pull` timeout) | Rate limit de Docker Hub           | Reintentar el job; si persiste, ver hardening T-CI-01          |
| Postgres no levanta en 5432                                 | Postgres nativo ocupando el puerto | Usar 5433 en dev (ya configurado)                              |
| `.env` con caracteres raros                                 | Encoding UTF-16/BOM                | Guardar el `.env` como UTF-8 sin BOM                           |
| CI roto tras subir pnpm/Node                                | Versiones no fijadas               | Usar pnpm 9.15.9 + Node 20                                     |
| commit rechazado (`subject/type empty`)                     | commitlint (Conventional Commits)  | `git commit -m "docs: ..."` (tipo válido: feat/fix/docs/chore) |

---

## 7. Prompt para generar un README autoritativo (si algún comando de arriba no coincide)

> Enviar a Claude Code (solo lectura) para confirmar los comandos reales:

```
# TAREA: T-DOC-README · Generar guía de ejecución desde el repo real · Dueño: (lectura)
- Leer package.json (raíz + apps/api + apps/web), turbo.json, docker-compose*, prisma/, .env.example,
  y cualquier README existente.
- Reportar los comandos REALES para: instalar, preparar env, levantar Postgres/Redis, migrar, generar
  Prisma, correr API y web (con sus puertos reales), y correr la suite de tests.
- Marcar cada comando como [verificado en package.json/script] con la ruta.
- Salida: un README.md de "cómo correr el proyecto" listo para /docs. Solo lectura, sin cambios de código.
```

---

_Guía de ejecución y demo · AdoptaFácil V2.0 · corte 26-jul-2026. Confirmar scripts contra el repo real antes de compartir con terceros._
