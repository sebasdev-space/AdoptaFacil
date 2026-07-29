/**
 * Idempotent demo seed (T-D01). Leaves the local DB ready for the client demo
 * (2026-07-30, scope: organización + donación) by driving the REAL NestJS
 * services — not raw SQL — so RLS, RBAC-attributed audit, append-only
 * formalization history, and the (currently empty) verification-level ladder
 * all stay coherent with what the running API would produce.
 *
 * Usage (from repo root, AFTER `pnpm seed:admin`):
 *   pnpm seed:demo
 *
 * Env overrides (all optional):
 *   SEED_DEMO_PASSWORD   — shared password for the demo Owner/Person accounts.
 *                           Dev-only default below; NEVER a real credential.
 *   PLATFORM_ADMIN_EMAIL — must match the PlatformAdmin created by seed:admin
 *                           (same default as that script: admin@adoptafacil.local).
 *
 * Forces NOTIFICATION_DRIVER=log and STORAGE_DRIVER=disk regardless of `.env`
 * (the local `.env` has real Gmail SMTP configured; this seed must never send
 * a real email, and documents/photos must land on disk like the real demo).
 *
 * Idempotent by natural keys: owner/donor email, organization slug, document
 * type per org, animal name per org. Re-running never duplicates or fails.
 *
 * KNOWN LIMITATION (reported, not invented around): `VERIFICATION_LEVELS`
 * (apps/api/src/modules/org/verification.ts) is an EMPTY TODO(client) catalog,
 * and the `organization_profiles.verification_level` column the public portal
 * reads is never written by any real service. Approving documents here is
 * still done for REAL (audited, RLS-scoped, versioned) — but the public badge
 * will show Level 0 for BOTH organizations regardless. The visible contrast in
 * the demo comes from the FORMALIZATION state instead (ESAL vs En proceso),
 * which is real and live today.
 */
import { NestFactory } from '@nestjs/core';

// Force these BEFORE the Nest app (and its ConfigModule) bootstraps — dotenv
// never overrides an already-set process.env value, so this wins over `.env`.
process.env.NOTIFICATION_DRIVER = 'log';
process.env.STORAGE_DRIVER = 'disk';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AnimalSex,
  type AnimalSize,
  type AnimalSpecies,
  DocumentStatus,
  DocumentType,
  FORMALIZATION_SEQUENCE,
  FormalizationState,
  OrganizationType,
} from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/core/auth/auth.service';
import { TenantContextService } from '../src/core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../src/core/storage/storage.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrgProfileService } from '../src/modules/org/org-profile.service';
import { FormalizationService } from '../src/modules/org/formalization.service';
import { DocumentsService } from '../src/modules/org/documents.service';
import { PlatformDocumentsService } from '../src/modules/org/platform-documents.service';
import { AnimalsService } from '../src/modules/animals/animals.service';
import { loadAssetOrGenerate, minimalPdf, simplePng } from './seed-assets';

// ---------------------------------------------------------------------------
// Credentials — NEVER hardcoded secrets. Emails are demo-only identifiers
// (fake `.demo` domain), not sensitive; the password is the only secret and it
// ALWAYS comes from env, with an obviously-dev fallback.
// ---------------------------------------------------------------------------
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoPass123!';
const PLATFORM_ADMIN_EMAIL = (process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@adoptafacil.local')
  .trim()
  .toLowerCase();

if (!process.env.SEED_DEMO_PASSWORD) {
  console.warn(
    '[seed:demo] SEED_DEMO_PASSWORD no está definida — usando el default de desarrollo ' +
      '"DemoPass123!". Defínela en tu .env para no depender de este valor.',
  );
}

const YEARS_MS = 365.25 * 24 * 60 * 60 * 1000;
const yearsAgoIso = (years: number): string =>
  new Date(Date.now() - years * YEARS_MS).toISOString();
const yearsFromNowIso = (years: number): string =>
  new Date(Date.now() + years * YEARS_MS).toISOString();

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

interface DocumentDef {
  type: DocumentType;
  title: string;
  approve: boolean;
}

interface AnimalDef {
  name: string;
  species: AnimalSpecies;
  sex: AnimalSex;
  size: AnimalSize;
  yearsAgo: number;
  breed?: { mode: 'catalog' | 'custom'; name: string };
  color: readonly [number, number, number];
  description: string;
}

interface OrgDef {
  key: string;
  organizationName: string;
  ownerDisplayName: string;
  ownerEmail: string;
  organizationType: OrganizationType;
  city: string;
  department: string;
  description: string;
  slug: string;
  socialLinks: { instagram?: string; facebook?: string };
  formalizationTarget: FormalizationState;
  documents: DocumentDef[];
  animals: AnimalDef[];
}

const ORG_DEFS: OrgDef[] = [
  {
    key: 'patitas-felices',
    organizationName: 'Refugio Patitas Felices',
    ownerDisplayName: 'Camila Rojas',
    ownerEmail: 'owner@refugiopatitasfelices.demo',
    organizationType: OrganizationType.Shelter,
    city: 'Bogotá',
    department: 'Cundinamarca',
    description:
      'Rescatamos, rehabilitamos y encontramos hogar para perros y gatos en situación de calle ' +
      'en Bogotá desde 2018. Cada adopción es un compromiso de por vida — nosotros acompañamos ' +
      'ese camino con seguimiento veterinario y post-adopción.',
    slug: 'patitas-felices',
    socialLinks: { instagram: 'https://instagram.com/patitasfelices.demo' },
    formalizationTarget: FormalizationState.ESAL,
    documents: [
      { type: DocumentType.Rut, title: 'RUT - Refugio Patitas Felices', approve: true },
      {
        type: DocumentType.ExistenceRepresentationCertificate,
        title: 'Certificado de Existencia y Representación Legal',
        approve: true,
      },
      { type: DocumentType.Other, title: 'Estatutos de la Fundación', approve: true },
    ],
    animals: [
      {
        name: 'Firulais',
        species: 'dog',
        sex: 'male',
        size: 'medium',
        yearsAgo: 3,
        breed: { mode: 'catalog', name: 'Criollo' },
        color: [180, 140, 90],
        description: 'Juguetón y muy sociable con otros perros. Esterilizado y vacunado.',
      },
      {
        name: 'Michu',
        species: 'cat',
        sex: 'female',
        size: 'small',
        yearsAgo: 2,
        breed: { mode: 'custom', name: 'Angora mestizo' },
        color: [230, 230, 230],
        description: 'Tranquila, ideal para apartamento. Le encanta dormir al sol.',
      },
      {
        name: 'Rocco',
        species: 'dog',
        sex: 'male',
        size: 'large',
        yearsAgo: 5,
        color: [90, 70, 50],
        description: 'Guardián por naturaleza, necesita espacio y ejercicio diario.',
      },
      {
        name: 'Luna',
        species: 'cat',
        sex: 'female',
        size: 'small',
        yearsAgo: 1,
        color: [40, 40, 40],
        description: 'Cachorra rescatada hace unos meses, muy curiosa y juguetona.',
      },
    ],
  },
  {
    key: 'huellas-esperanza',
    organizationName: 'Fundación Huellas de Esperanza',
    ownerDisplayName: 'Andrés Gómez',
    ownerEmail: 'owner@huellasesperanza.demo',
    organizationType: OrganizationType.Foundation,
    city: 'Medellín',
    department: 'Antioquia',
    description:
      'Fundación dedicada a la protección animal en el Valle de Aburrá: rescate, esterilización ' +
      'y adopción responsable. Estamos formalizando nuestra fundación para operar con total ' +
      'transparencia ante donantes y aliados.',
    slug: 'huellas-esperanza',
    socialLinks: { facebook: 'https://facebook.com/huellasesperanza.demo' },
    formalizationTarget: FormalizationState.EnProceso,
    documents: [
      { type: DocumentType.Rut, title: 'RUT - Fundación Huellas de Esperanza', approve: true },
      {
        type: DocumentType.ExistenceRepresentationCertificate,
        title: 'Certificado de Existencia y Representación Legal',
        approve: true,
      },
      // Left PENDING on purpose: shows the review queue has real work, and
      // contrasts against Org 1 (all documents approved).
      { type: DocumentType.Other, title: 'Estatutos de la Fundación', approve: false },
    ],
    animals: [
      {
        name: 'Toby',
        species: 'dog',
        sex: 'male',
        size: 'medium',
        yearsAgo: 4,
        color: [200, 170, 120],
        description:
          'Rescatado de una situación de maltrato, hoy confía plenamente en las personas.',
      },
      {
        name: 'Nina',
        species: 'cat',
        sex: 'female',
        size: 'small',
        yearsAgo: 2,
        breed: { mode: 'custom', name: 'Siamés mestizo' },
        color: [225, 210, 180],
        description: 'Muy vocal y cariñosa, se lleva bien con niños.',
      },
      {
        name: 'Simón',
        species: 'dog',
        sex: 'male',
        size: 'large',
        yearsAgo: 6,
        breed: { mode: 'catalog', name: 'Labrador mestizo' },
        color: [230, 200, 140],
        description: 'Perro sénior, tranquilo, ya entrenado en casa.',
      },
    ],
  },
];

const DONOR_EMAIL = 'donante@demo.adoptafacil.local';
const DONOR_NAME = 'Valentina Torres';

/** Load the repo-root `.env` — mirrors seed-platform-admin.ts's approach, kept
 *  ONLY as a fallback in case this script ever runs outside a Nest bootstrap;
 *  ConfigModule (bootstrapped below) is the primary env loader for this script. */
function loadRootEnvFallback(): void {
  const envPath = join(__dirname, '..', '..', '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadRootEnvFallback();

interface CredentialRow {
  rol: string;
  correo: string;
  contraseña: string;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  const tenant = app.get(TenantContextService);
  const auth = app.get(AuthService);
  const prisma = app.get(PrismaService);
  const storage = app.get<StoragePort>(STORAGE_PORT);
  const orgProfile = app.get(OrgProfileService);
  const formalization = app.get(FormalizationService);
  const documents = app.get(DocumentsService);
  const platformDocuments = app.get(PlatformDocumentsService);
  const animalsService = app.get(AnimalsService);

  const credentialRows: CredentialRow[] = [];

  try {
    // --- 0. Resolve the PlatformAdmin created by `seed:admin` ---------------
    const platformAdminCredential = await prisma.authCredential.findUnique({
      where: { email: PLATFORM_ADMIN_EMAIL },
    });
    if (!platformAdminCredential) {
      throw new Error(
        `No existe un PlatformAdmin con el correo ${PLATFORM_ADMIN_EMAIL}. ` +
          'Corre `pnpm seed:admin` primero.',
      );
    }
    const platformAdminUserId = platformAdminCredential.userId;
    console.log(`[seed:demo] PlatformAdmin reutilizado: ${PLATFORM_ADMIN_EMAIL}.`);

    // --- 1. Organizations ----------------------------------------------------
    for (const def of ORG_DEFS) {
      console.log(`\n[seed:demo] === ${def.organizationName} ===`);

      // 1a. Owner + organization (idempotent by owner email).
      let organizationId: string;
      let ownerUserId: string;
      const existingOwner = await prisma.authCredential.findUnique({
        where: { email: def.ownerEmail },
      });
      if (existingOwner) {
        organizationId = existingOwner.organizationId;
        ownerUserId = existingOwner.userId;
        console.log(`[seed:demo] Organización ya existe (owner=${def.ownerEmail}) — reutilizada.`);
      } else {
        const session = await auth.registerOrganization({
          organizationName: def.organizationName,
          displayName: def.ownerDisplayName,
          email: def.ownerEmail,
          password: DEMO_PASSWORD,
        });
        organizationId = session.user.organizationId;
        ownerUserId = session.user.id;
        console.log(`[seed:demo] Organización creada (owner=${def.ownerEmail}).`);
      }
      credentialRows.push({
        rol: `Owner — ${def.organizationName}`,
        correo: def.ownerEmail,
        contraseña: 'SEED_DEMO_PASSWORD',
      });

      // 1b. Profile (logo + cover + description + location + type). Always
      // re-applied — updateProfile is a real upsert, safe to call every run.
      const logoAsset = loadAssetOrGenerate('logos', `${def.key}-logo`, () => ({
        bytes: simplePng(320, 320, [96, 165, 250]),
        filename: `${def.key}-logo.png`,
        contentType: 'image/png',
      }));
      const logoTarget = await storage.createUploadTarget({
        organizationId,
        filename: logoAsset.filename,
        contentType: logoAsset.contentType,
        visibility: 'public',
      });
      await storage.saveObject(logoTarget.key, logoAsset.bytes, logoAsset.contentType);

      const coverAsset = loadAssetOrGenerate('logos', `${def.key}-cover`, () => ({
        bytes: simplePng(800, 300, [253, 224, 71]),
        filename: `${def.key}-cover.png`,
        contentType: 'image/png',
      }));
      const coverTarget = await storage.createUploadTarget({
        organizationId,
        filename: coverAsset.filename,
        contentType: coverAsset.contentType,
        visibility: 'public',
      });
      await storage.saveObject(coverTarget.key, coverAsset.bytes, coverAsset.contentType);

      // NOTE: `createUploadTarget().url` is the UPLOAD target (where bytes are
      // PUT) — NOT the public serve URL. `resolvePublicUrl(key)` is the one the
      // profile's `logoUrl`/`coverPhotos` fields must store (a plain absolute
      // URL string a browser can GET directly).
      await tenant.run({ organizationId }, () =>
        orgProfile.updateProfile(ownerUserId, {
          description: def.description,
          logoUrl: storage.resolvePublicUrl(logoTarget.key),
          coverPhotos: [storage.resolvePublicUrl(coverTarget.key)],
          location: { country: 'Colombia', department: def.department, city: def.city },
          socialLinks: def.socialLinks,
          organizationType: def.organizationType,
          slug: def.slug,
        }),
      );
      console.log(`[seed:demo] Perfil actualizado (logo/portada reales vía StoragePort).`);

      // 1c. Formalization — step through REAL adjacent transitions only as far
      // as needed (idempotent: a second run finds the target already reached).
      await tenant.run({ organizationId }, async () => {
        const status = await formalization.getStatus();
        let currentIndex = FORMALIZATION_SEQUENCE.indexOf(status.state);
        const targetIndex = FORMALIZATION_SEQUENCE.indexOf(def.formalizationTarget);
        if (currentIndex >= targetIndex) {
          console.log(`[seed:demo] Formalización ya en "${status.state}" — sin cambios.`);
          return;
        }
        while (currentIndex < targetIndex) {
          const nextState = FORMALIZATION_SEQUENCE[currentIndex + 1];
          await formalization.transition(ownerUserId, { targetState: nextState });
          currentIndex += 1;
          console.log(`[seed:demo] Formalización avanzada a "${nextState}".`);
        }
      });

      // 1d. Documents — upload (idempotent by type) + approve via PlatformAdmin
      // (idempotent: skips if already decided).
      for (const docDef of def.documents) {
        const existingDocs = await tenant.run({ organizationId }, () => documents.list());
        let doc = existingDocs.find((d) => d.type === docDef.type);

        if (!doc) {
          const asset = loadAssetOrGenerate('documents', `${def.key}-${docDef.type}`, () => ({
            bytes: minimalPdf(docDef.title),
            filename: `${docDef.type}.pdf`,
            contentType: 'application/pdf',
          }));
          const result = await tenant.run({ organizationId }, () =>
            documents.upload(ownerUserId, {
              type: docDef.type,
              filename: asset.filename,
              contentType: asset.contentType,
              issuedAt: yearsAgoIso(1),
              expiresAt: yearsFromNowIso(2),
            }),
          );
          await storage.saveObject(result.upload.key, asset.bytes, asset.contentType);
          doc = result.document;
          console.log(`[seed:demo] Documento subido: ${docDef.type} (v${doc.version}).`);
        } else {
          console.log(`[seed:demo] Documento ya existe: ${docDef.type} (v${doc.version}).`);
        }

        const decidable =
          doc.status === DocumentStatus.Pending || doc.status === DocumentStatus.UnderReview;
        if (docDef.approve && decidable) {
          await platformDocuments.decide(platformAdminUserId, doc.id, { decision: 'approve' });
          console.log(`[seed:demo] Documento aprobado: ${docDef.type}.`);
        } else if (docDef.approve) {
          console.log(`[seed:demo] Documento ${docDef.type} ya estaba decidido (${doc.status}).`);
        } else {
          console.log(`[seed:demo] Documento ${docDef.type} queda pendiente a propósito (demo).`);
        }
      }

      // 1e. Animals (idempotent by name within the org).
      await tenant.run({ organizationId }, async () => {
        const existingAnimals = await animalsService.list(true);
        for (const animalDef of def.animals) {
          if (existingAnimals.some((a) => a.name === animalDef.name)) {
            console.log(`[seed:demo] Animal ya existe: ${animalDef.name} — no se duplica.`);
            continue;
          }

          let breedId: string | undefined;
          let customBreed: string | undefined;
          if (animalDef.breed?.mode === 'catalog') {
            const existingBreeds = await animalsService.listBreeds(animalDef.species);
            const found = existingBreeds.find((b) => b.name === animalDef.breed?.name);
            breedId = found
              ? found.id
              : (
                  await animalsService.createBreed(ownerUserId, {
                    species: animalDef.species,
                    name: animalDef.breed.name,
                  })
                ).id;
          } else if (animalDef.breed?.mode === 'custom') {
            customBreed = animalDef.breed.name;
          }

          const photoAsset = loadAssetOrGenerate(
            'animals',
            `${def.key}-${slugify(animalDef.name)}`,
            () => ({
              bytes: simplePng(256, 256, animalDef.color),
              filename: `${slugify(animalDef.name)}.png`,
              contentType: 'image/png',
            }),
          );

          const created = await animalsService.create(ownerUserId, {
            name: animalDef.name,
            species: animalDef.species,
            sex: animalDef.sex,
            size: animalDef.size,
            breedId,
            customBreed,
            birthDate: yearsAgoIso(animalDef.yearsAgo),
            description: animalDef.description,
            photos: [{ filename: photoAsset.filename, contentType: photoAsset.contentType }],
          });
          const photoKey = created.photoRecords?.[0]?.storageRef;
          if (photoKey) {
            await storage.saveObject(photoKey, photoAsset.bytes, photoAsset.contentType);
          }
          console.log(`[seed:demo] Animal creado: ${animalDef.name}.`);
        }
      });
    }

    // --- 2. Donor Person account --------------------------------------------
    const existingDonor = await prisma.authCredential.findUnique({ where: { email: DONOR_EMAIL } });
    if (existingDonor) {
      console.log(`\n[seed:demo] Persona donante ya existe (${DONOR_EMAIL}) — reutilizada.`);
    } else {
      await auth.registerPerson({
        displayName: DONOR_NAME,
        email: DONOR_EMAIL,
        password: DEMO_PASSWORD,
      });
      console.log(`\n[seed:demo] Persona donante creada (${DONOR_EMAIL}).`);
    }
    credentialRows.push({
      rol: 'Persona (donante)',
      correo: DONOR_EMAIL,
      contraseña: 'SEED_DEMO_PASSWORD',
    });

    // --- 3. Credentials table (never prints the password in clear) ---------
    console.log('\n[seed:demo] Listo. Credenciales para la demo:');
    console.table(
      credentialRows.map((row) => ({
        Rol: row.rol,
        Correo: row.correo,
        'Contraseña (variable de entorno)': `${row.contraseña} (o default de dev si no está definida)`,
      })),
    );
    console.log(
      `[seed:demo] Portales públicos: /public/organizations/${ORG_DEFS[0].slug} y ` +
        `/public/organizations/${ORG_DEFS[1].slug}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('[seed:demo] Error:', error);
  process.exit(1);
});
