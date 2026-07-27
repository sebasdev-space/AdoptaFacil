import { Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireRoles } from '../auth';
import { AppLayout } from '../layout';
import { ANIMAL_VIEW_ROLES, ORG_DOCUMENTS_ROLES, PLATFORM_DOCUMENTS_ROLES } from '../navigation';
import { AnimalDetailPage } from '../pages/animal-detail-page';
import { HomePage, NotFoundPage, PlaceholderPage } from '../../features/_layout';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from '../../features/auth';
import {
  OrgDocumentsPage,
  OrgFormalizationPage,
  OrgProfilePage,
  PlatformDocumentsReviewPage,
} from '../../features/org';
import { OrgPublicPage, PortalThemePage, PublicAnimalDetailPage } from '../../features/portals';
import { PublicCampaignDetailPage, PublicCampaignsPage } from '../../features/campaigns';
import { AnimalsPage, RemindersInboxPage } from '../../features/animals';
import { AdoptionRequestPage, AdoptionsKanbanPage } from '../../features/adoptions';
import { DonatePage } from '../../features/donations';
import { CertificateEmissionPage, CertificateVerificationPage } from '../../features/certificates';

/**
 * Route tree for the shell.
 *
 *   /login, /register, /forgot → public (auth screens, M02 / T-023)
 *   everything else            → protected by <RequireAuth>, rendered inside the
 *                                <AppLayout> shell (sidebar + header + indicator)
 *
 * Protected sections whose real screens arrive in Ola 1 render <PlaceholderPage>.
 * Module owners swap those elements without touching the guard or the layout.
 *
 * Exposed as an element (not a data router) so tests can mount it under a
 * <MemoryRouter initialEntries={…}> to exercise public vs protected routing.
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Public auth screens */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot" element={<ForgotPasswordPage />} />
      {/* Public reset screen reached from the emailed link (M02 / RF05, T-110).
          HANDOFF(@fabian): minimal shell route for the auth reset page (the page
          itself lives in features/auth). Cross-review this single line. */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* Public rich organization portal (§M14, T-026) — no auth, public fields
          only: real profile + placeholder sections wired per docs/TASKS.md. */}
      <Route path="/o/:slug" element={<OrgPublicPage />} />
      {/* Public animal detail within the org portal (§M14/M03, T-052) — public,
          AnimalSummary fields only (no clinical data). The "Solicitar adopción"
          button links to the /adopciones/solicitar flow, itself under RequireAuth. */}
      <Route path="/o/:slug/animales/:animalId" element={<PublicAnimalDetailPage />} />
      {/* Public certificate VERIFICATION — trust-flow mockup (§M05/RF14, T-053).
          "Vista de diseño": no backend; verifies a sample code deterministically,
          like the future public verification page. Public (no session). */}
      <Route path="/verificar" element={<CertificateVerificationPage />} />
      <Route path="/verificar/:code" element={<CertificateVerificationPage />} />
      {/* Public campaigns portal (§M14/M06, T-055) — no auth, active campaigns from
          /public/campaigns + public detail by id. The AUTHENTICATED org management
          screen (features/campaigns/CampaignsPage) is a separate surface (unrouted;
          daily item con @sebastian). */}
      <Route path="/campanas" element={<PublicCampaignsPage />} />
      <Route path="/campanas/:id" element={<PublicCampaignDetailPage />} />

      {/* Protected — guard first, then the shell layout */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          {/* M04 · adopciones (T-028a): tablero de evaluación (org) + solicitud (persona). */}
          <Route path="adopciones" element={<AdoptionsKanbanPage />} />
          <Route path="adopciones/solicitar" element={<AdoptionRequestPage />} />
          {/* M03 · animales + expediente clínico + recordatorios (T-031, wires
              T-104/T-105/T-106). Cada ruta exige los MISMOS @Roles que su endpoint
              (deny-by-default). El panel clínico es EMBEBIBLE por animalId → vive
              en el detalle /animales/:animalId, no como ruta top-level. */}
          <Route
            path="animales"
            element={
              <RequireRoles roles={ANIMAL_VIEW_ROLES}>
                <AnimalsPage />
              </RequireRoles>
            }
          />
          <Route
            path="animales/:animalId"
            element={
              <RequireRoles roles={ANIMAL_VIEW_ROLES}>
                <AnimalDetailPage />
              </RequireRoles>
            }
          />
          <Route
            path="recordatorios"
            element={
              <RequireRoles roles={ANIMAL_VIEW_ROLES}>
                <RemindersInboxPage />
              </RequireRoles>
            }
          />
          {/* M05 · donación P1 (T-050 lógica, T-051 cableado). La org llega por query
              param (organizationId + organizationName) desde el CTA del portal público;
              sin org, la página muestra su empty-state con el punto de integración M14.
              SEAM (donación de invitado): el gate de sesión es este <RequireAuth> padre.
              Si el cliente habilita checkout anónimo, mover ESTA ruta fuera del guard
              (o envolver DonatePage en un guard más suave) — cambio localizado, sin
              tocar la lógica de donación. */}
          <Route path="donaciones" element={<DonatePage />} />
          {/* M05/RF14 · certificate EMISSION mockup (T-053). Trust-flow step 2-3,
              reached from the real donation receipt. "Vista de diseño": no backend. */}
          <Route path="certificado" element={<CertificateEmissionPage />} />
          {/* /campanas ahora es PÚBLICO (portal de campañas, T-055) — declarado
              arriba fuera de RequireAuth; ya no es un placeholder protegido. */}
          <Route
            path="transparencia"
            element={
              <PlaceholderPage
                title="Transparencia"
                description="Formalización y rendición de cuentas del portal."
              />
            }
          />
          {/* M01 · organization profile + formalization (my lines, before catch-all). */}
          <Route path="organizacion" element={<OrgProfilePage />} />
          <Route path="organizacion/formalizacion" element={<OrgFormalizationPage />} />
          {/* M01 · gestión documental de la org (T-031, wires T-103, RF03). */}
          <Route
            path="organizacion/documentos"
            element={
              <RequireRoles roles={ORG_DOCUMENTS_ROLES}>
                <OrgDocumentsPage />
              </RequireRoles>
            }
          />
          {/* M14 · portal personalization by tokens (T-027, Owner/Admin gated). */}
          <Route path="organizacion/portal" element={<PortalThemePage />} />
          {/* M01 · revisión documental cross-tenant (T-031, wires T-103, RF03).
              Audiencia de PLATAFORMA — denegada a roles de organización. */}
          <Route
            path="plataforma/documentos"
            element={
              <RequireRoles roles={PLATFORM_DOCUMENTS_ROLES}>
                <PlatformDocumentsReviewPage />
              </RequireRoles>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
