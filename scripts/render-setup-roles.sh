#!/usr/bin/env bash
# scripts/render-setup-roles.sh — S1-01
#
# Repara el rol de runtime `adoptafacil_app` en la base de Render para que la
# API corra con RLS real (FORCE), en vez del workaround actual
# (DATABASE_URL_APP = DATABASE_URL + NO FORCE ROW LEVEL SECURITY en todas las
# tablas) que deja al owner de Postgres — y por lo tanto a toda la app — sin
# aislamiento de tenant.
#
# Qué hace (todo idempotente, seguro de correr más de una vez):
#   1. Confirma que el rol adoptafacil_app existe (lo crea `prisma migrate
#      deploy` vía la migración init; si no existe, aborta con instrucciones).
#   2. Rota su password al valor de ADOPTAFACIL_APP_PASSWORD (nunca hardcodeada).
#   3. Verifica que el rol OWNER (el que corre este script, vía DATABASE_URL)
#      pueda saltar RLS (superuser o BYPASSRLS). Si no puede, INTENTA
#      concederse BYPASSRLS a sí mismo. Si eso falla, ABORTA sin tocar FORCE.
#      Motivo: las funciones SECURITY DEFINER de /public/* (organization_public,
#      public_org_adoptable_animals, public_campaigns, etc.) y el script
#      `pnpm seed:admin` dependen de que su owner salte RLS por ser el dueño de
#      las tablas — exactamente como pasa hoy en local, donde el rol de
#      DATABASE_URL SÍ es superuser (lo crea así la imagen oficial de
#      postgres:16). En Render el owner casi seguro NO es superuser, así que
#      sin BYPASSRLS, restaurar FORCE rompe esos endpoints y ese seed en
#      silencio (devuelven 0 filas en vez de error).
#   4. Restaura FORCE ROW LEVEL SECURITY en TODAS las tablas con policy
#      `tenant_isolation` (las descubre dinámicamente vía pg_policies — no hay
#      lista hardcodeada que mantener cuando se agreguen tablas nuevas).
#   5. Verifica conectando como adoptafacil_app con el password nuevo
#      (SELECT 1).
#   6. Imprime el DATABASE_URL_APP listo para pegar en Render.
#
# Qué NO hace (a propósito): no otorga GRANTs nuevos ni corre
# "GRANT ... ON ALL TABLES" / "ALTER DEFAULT PRIVILEGES". Cada migración ya
# concede exactamente los privilegios que adoptafacil_app necesita, tabla por
# tabla (ver prisma/migrations/*_*), incluyendo revocaciones deliberadas — p.
# ej. audit_logs es SELECT+INSERT con UPDATE/DELETE/TRUNCATE revocados y
# bloqueados también por trigger (RNF04, append-only). Una concesión ciega de
# privilegios violaría ese diseño de mínimo privilegio y podría reabrir un
# hueco de auditoría.
#
# Uso (desde el Shell de Render — o cualquier shell con `pnpm` y Node — parado
# en la raíz del repo):
#   ADOPTAFACIL_APP_PASSWORD='<password-fuerte>' ./scripts/render-setup-roles.sh
#
# Requiere: DATABASE_URL en el entorno (conexión de owner; la misma que usa
# `pnpm db:deploy`).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL no está definido (conexión como owner, la misma que usa 'pnpm db:deploy')." >&2
  exit 1
fi
if [ -z "${ADOPTAFACIL_APP_PASSWORD:-}" ]; then
  echo "ERROR: ADOPTAFACIL_APP_PASSWORD no está definido. Elige un password fuerte y pásalo por env var (nunca lo hardcodees)." >&2
  exit 1
fi
if [ "${#ADOPTAFACIL_APP_PASSWORD}" -lt 12 ]; then
  echo "ERROR: ADOPTAFACIL_APP_PASSWORD debe tener al menos 12 caracteres." >&2
  exit 1
fi

# prisma db execute no requiere psql (que no viene instalado en el Shell de un
# servicio Node de Render) — reutiliza el mismo CLI que ya usa `pnpm db:deploy`.
run_sql() {
  printf '%s' "$1" | pnpm exec prisma db execute --stdin --url="$DATABASE_URL"
}

echo "==> 1/5 Verificando que el rol adoptafacil_app exista..."
run_sql "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'adoptafacil_app') THEN
    RAISE EXCEPTION 'El rol adoptafacil_app no existe todavia. Corre \"pnpm db:deploy\" primero (la migracion init lo crea).';
  END IF;
END
\$\$;
"

echo "==> 2/5 Rotando el password de adoptafacil_app..."
ESCAPED_PW=$(printf '%s' "$ADOPTAFACIL_APP_PASSWORD" | sed "s/'/''/g")
run_sql "ALTER ROLE adoptafacil_app WITH PASSWORD '$ESCAPED_PW';"

echo "==> 3/5 Verificando que el owner pueda saltar RLS (superuser o BYPASSRLS)..."
run_sql "
DO \$\$
DECLARE
  v_is_super BOOLEAN;
  v_bypass BOOLEAN;
BEGIN
  SELECT rolsuper, rolbypassrls INTO v_is_super, v_bypass
  FROM pg_roles WHERE rolname = current_user;

  IF v_is_super OR v_bypass THEN
    RAISE NOTICE 'OK: % ya puede saltar RLS (superuser=%, bypassrls=%).', current_user, v_is_super, v_bypass;
    RETURN;
  END IF;

  BEGIN
    EXECUTE format('ALTER ROLE %I BYPASSRLS', current_user);
    RAISE NOTICE 'OK: se otorgo BYPASSRLS a % (necesario para que las funciones SECURITY DEFINER de /public/* y pnpm seed:admin sigan funcionando bajo FORCE).', current_user;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'No se pudo otorgar BYPASSRLS a % (%). Esto es esperable si Render no permite que el owner se auto-conceda ese atributo (solo un superuser puede otorgar BYPASSRLS, incluso con CREATEROLE — confirmado en Postgres 16). NO se restauro FORCE, para no romper /public/* y pnpm seed:admin en silencio. Ver \"Hallazgo\" en DEPLOY.md (S1-01) para el plan alterno.', current_user, SQLERRM;
  END;
END
\$\$;
"

echo "==> 4/5 Restaurando FORCE ROW LEVEL SECURITY en las tablas con policy tenant_isolation..."
run_sql "
DO \$\$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT schemaname, tablename
    FROM pg_policies
    WHERE policyname = 'tenant_isolation'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', r.schemaname, r.tablename);
    RAISE NOTICE 'FORCE restaurado en %.%', r.schemaname, r.tablename;
  END LOOP;
END
\$\$;
"

echo "==> 5/5 Verificando conexion como adoptafacil_app con el password nuevo..."
APP_URL=$(node -e '
const { URL } = require("node:url");
const u = new URL(process.argv[1]);
u.username = "adoptafacil_app";
u.password = process.argv[2];
process.stdout.write(u.toString());
' "$DATABASE_URL" "$ADOPTAFACIL_APP_PASSWORD")

printf 'SELECT 1;' | pnpm exec prisma db execute --stdin --url="$APP_URL" > /dev/null
echo "OK: adoptafacil_app puede conectar y ejecutar consultas."

echo ""
echo "==================================================================="
echo "Listo. En Render: dashboard -> adoptafacil-api -> Environment, pega"
echo "esto en DATABASE_URL_APP:"
echo ""
echo "$APP_URL"
echo ""
echo "Guardar la env var dispara un redeploy automatico del API."
echo "==================================================================="
