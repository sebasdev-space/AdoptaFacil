# Prisma — split schema & multi-tenant RLS

The schema is **split by module** using Prisma's `prismaSchemaFolder`. Each file
in [`schema/`](./schema) is owned by one person (see `CODEOWNERS`) so owners edit
their module without merge conflicts.

- [`schema/schema.prisma`](./schema/schema.prisma) — datasource + generator (shared).
- [`schema/org.prisma`](./schema/org.prisma) — `Organization` (tenant anchor) and
  `RlsProbe` (the canonical RLS reference table, harness only).
- `schema/<module>.prisma` — one stub per module (`animals`, `adoptions`, …), no
  business models yet.

## Multi-tenancy pattern (mandatory for every business table)

1. Add an `organization_id uuid` column referencing `organizations`.
2. `ENABLE` **and** `FORCE` Row-Level Security on the table.
3. Add a `tenant_isolation` policy filtering by
   `current_setting('app.current_org_id')`.
4. Access data as the **non-superuser** `adoptafacil_app` role (superusers and,
   without `FORCE`, owners bypass RLS).
5. Set `app.current_org_id` per transaction — see
   `PrismaService.withOrgContext()` in `apps/api`.

The reference SQL lives in [`rls-policy.reference.sql`](./rls-policy.reference.sql)
and is applied via the initial migration. The cross-org no-leak test
(`apps/api/test/rls-no-leak.integration-spec.ts`) is the **seed each module owner
replicates** for their own tables — it is a required CI gate (`rls-no-leak`).

## Commands (run from the repo root)

```bash
pnpm prisma generate       # generate the client (no DB needed)
pnpm prisma migrate dev     # create/apply migrations (needs Postgres up)
```

### Regenerating the initial migration from scratch

```bash
# 1. Scaffold the migration without applying it
pnpm prisma migrate dev --create-only --name init
# 2. Append the RLS reference SQL to the generated migration.sql
#    (cat prisma/rls-policy.reference.sql >> prisma/migrations/<ts>_init/migration.sql)
# 3. Apply
pnpm prisma migrate dev
```
