-- NOTE (mismo patrón que otras migraciones recientes, ver s2_dian_verification /
-- t_portal_subdomain_resolution / t_reconciliation_report): el diff de Prisma
-- propuso además DROP de ~24 foreign keys añadidas a mano en migraciones
-- anteriores, un DROP INDEX de organizations_name_trgm_idx, un ALTER de
-- platform_settings.updated_at y un RENAME de un índice de sponsorships, todos
-- sin relación con esta tarea. Ninguno de esos va aquí.

-- T-Google-SignIn (auth): login con Google (cualquier tipo de cuenta, solo para
-- entrar a una cuenta existente o crear una Persona nueva liviana — NUNCA una
-- organización) + gate de perfil incompleto (phone/documentId/address) antes
-- de donar/apadrinar, solicitar adopción o inscribirse a voluntariado.

-- AlterTable
ALTER TABLE "auth_credentials" ADD COLUMN     "auth_provider" TEXT NOT NULL DEFAULT 'password',
ADD COLUMN     "google_sub" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "document_id" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "auth_credentials_google_sub_key" ON "auth_credentials"("google_sub");
