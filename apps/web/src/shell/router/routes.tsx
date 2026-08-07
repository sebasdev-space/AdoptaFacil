import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireRoles } from '../auth';
import { AppLayout } from '../layout';
import {
  ADOPTIONS_MANAGEMENT_ROLES,
  ANIMAL_VIEW_ROLES,
  CAMPAIGNS_VIEW_ROLES,
  ORG_DOCUMENTS_ROLES,
  ORG_MEMBER_ROLES,
  PLATFORM_DOCUMENTS_ROLES,
  SPONSORSHIP_VIEW_ROLES,
} from '../navigation';
import { AnimalDetailPage } from '../pages/animal-detail-page';
import { GeneralPortalPage } from '../../features/catalog';
import { HomePage, NotFoundPage } from '../../features/_layout';
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
import {
  CampaignDetailPage,
  CampaignsPage,
  PublicCampaignDetailPage,
  PublicCampaignsPage,
} from '../../features/campaigns';
import { AnimalsPage, RemindersInboxPage } from '../../features/animals';
import {
  AdoptionRequestPage,
  AdoptionsKanbanPage,
  MyAdoptionRequestsPage,
} from '../../features/adoptions';
import { DonatePage } from '../../features/donations';
import { SponsorPage, SponsorshipsPage } from '../../features/sponsorships';
import { CertificateEmissionPage, CertificateVerificationPage } from '../../features/certificates';

/**
 * Route tree for the shell.
 *
 *   /                          → PUBLIC general portal (F-LANDING-01, M14, RF25):
 *                                the platform's front door — consolidated animal
 *                                catalog across every org, login/register access,
 *                                no session required. A user WITH a session who
 *                                lands here is redirected to /inicio (their shell)
 *                                by the page itself (`useSession().status`).
 *   /login, /register, /forgot → public (auth screens, M02 / T-023)
 *   /inicio                    → the authenticated shell's home (protected;
 *                                was the index route before F-LANDING-01 claimed
 *                                "/" for the public portal — moved, not removed).
 *   everything else            → protected by <RequireAuth>, rendered inside the
 *                                <AppLayout> shell (sidebar + header + indicator)
 *
 * Protected sections whose real screens haven't landed yet just aren't routed/
 * navigable (T-065, pre-demo) instead of rendering a stale placeholder — module
 * owners add the real route (and its nav entry) when the screen exists.
 *
 * Exposed as an element (not a data router) so tests can mount it under a
 * <MemoryRouter initialEntries={…}> to exercise public vs protected routing.
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Public general portal (F-LANDING-01) — the platform's entry point. */}
      <Route path="/" element={<GeneralPortalPage />} />
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
          screen lives at /organizacion/campanas below (S2-01), a separate surface. */}
      <Route path="/campanas" element={<PublicCampaignsPage />} />
      <Route path="/campanas/:id" element={<PublicCampaignDetailPage />} />

      {/* Protected — guard first, then the shell layout */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          {/* F-LANDING-01: "/" now belongs to the public general portal, so the
              authenticated shell's home moved to /inicio (nav entry updated to
              match). Not an index route anymore — there is no bare protected "". */}
          <Route path="inicio" element={<HomePage />} />
          {/* M04 · adopciones (T-028a): tablero de evaluación (org) + solicitud (persona).
              F1-02: el tablero de evaluación solo tenía el gate del ITEM de nav (#86) —
              tecleando la URL directo, cualquier autenticado entraba a la vista de gestión.
              `ADOPTIONS_MANAGEMENT_ROLES` está calcada de `EVAL_ROLES` en
              `adoptions.controller.ts` (`GET /adoptions`); reutilizada, no redefinida.
              "Solicitar adopción" es de PERSONA (`POST /adoptions` sin `@Roles`, cualquier
              autenticado) — se queda solo con `RequireAuth`, sin role-guard. */}
          <Route
            path="adopciones"
            element={
              <RequireRoles roles={ADOPTIONS_MANAGEMENT_ROLES}>
                <AdoptionsKanbanPage />
              </RequireRoles>
            }
          />
          <Route path="adopciones/solicitar" element={<AdoptionRequestPage />} />
          {/* F1-01: "Mis solicitudes" de la Persona — GET /adoptions/mine no tiene
              gate de rol (igual que /donaciones), así que esta ruta tampoco lleva
              <RequireRoles>; el nav item ya la oculta a cuentas de organización
              (`personaOnly`, nav-items.ts) y la propia página muestra "Mis
              solicitudes" vacío/con error si algo raro llegara a pasar por URL. */}
          <Route path="mis-solicitudes" element={<MyAdoptionRequestsPage />} />
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
              tocar la lógica de donación.
              F1-02: revisado contra el backend — `POST /donations` no lleva `@Roles`
              (cualquier autenticado dona), así que esta ruta se queda sin role-guard,
              igual que "Adopciones/solicitar". `GET /donations/received` (MANAGE_ROLES:
              Owner/Administrador/Operador) SÍ es de gestión de org, pero aún no tiene
              página/ruta en el frontend — no hay nada que gatear todavía; queda como
              backlog propio (M05, no es cruce con Sebastián). */}
          <Route path="donaciones" element={<DonatePage />} />
          {/* M07 · apadrinamiento P1 (RF17, S2-03). Mismo SEAM que donaciones: la
              org/animal objetivo llega por query param (animalId [+ animalName,
              organizationName]) desde el detalle público de un animal (§M14,
              fuera de alcance de S2-03); sin objetivo, "mis apadrinamientos". */}
          <Route path="apadrinar" element={<SponsorPage />} />
          {/* M05/RF14 · certificate EMISSION mockup (T-053). Trust-flow step 2-3,
              reached from the real donation receipt. "Vista de diseño": no backend. */}
          <Route path="certificado" element={<CertificateEmissionPage />} />
          {/* /campanas ahora es PÚBLICO (portal de campañas, T-055) — declarado
              arriba fuera de RequireAuth; ya no es un placeholder protegido. */}
          {/* T-065 (pre-demo): la ruta se mantiene registrada (no se borra, reversible
              post-30) pero ya NO muestra el placeholder ("se implementará en la Ola
              1...") — nada de "pendiente" visible en la demo. Redirige a inicio; el
              indicador REAL de transparencia (Nivel/%/Rendición) ya vive en la barra
              superior del shell en todas las pantallas. */}
          <Route path="transparencia" element={<Navigate to="/inicio" replace />} />
          {/* M01 · organization profile + formalization (my lines, before catch-all).
              T-062: gated to ORG_MEMBER_ROLES — a Persona has no org to manage;
              matches GET /org/profile and GET /org/formalization (any authenticated
              member, no @Roles — the backend scopes by tenant, not role). */}
          <Route
            path="organizacion"
            element={
              <RequireRoles roles={ORG_MEMBER_ROLES}>
                <OrgProfilePage />
              </RequireRoles>
            }
          />
          <Route
            path="organizacion/formalizacion"
            element={
              <RequireRoles roles={ORG_MEMBER_ROLES}>
                <OrgFormalizationPage />
              </RequireRoles>
            }
          />
          {/* M01 · gestión documental de la org (T-031, wires T-103, RF03). */}
          <Route
            path="organizacion/documentos"
            element={
              <RequireRoles roles={ORG_DOCUMENTS_ROLES}>
                <OrgDocumentsPage />
              </RequireRoles>
            }
          />
          {/* M14 · portal personalization by tokens (T-027). Owner/Admin gate the
              EDIT action (backend PUT + PortalThemePage itself); T-062 gates
              VIEW/ENTRY here to ORG_MEMBER_ROLES, matching GET /portals/theme. */}
          <Route
            path="organizacion/portal"
            element={
              <RequireRoles roles={ORG_MEMBER_ROLES}>
                <PortalThemePage />
              </RequireRoles>
            }
          />
          {/* M06 · gestión de campañas de recaudación para la organización (RF15,
              S2-01). Reconecta el screen autenticado que T-065 dejó sin ruta;
              gated a CAMPAIGNS_VIEW_ROLES, calcado del @Roles real de
              CampaignsController (GET /campaigns). */}
          <Route
            path="organizacion/campanas"
            element={
              <RequireRoles roles={CAMPAIGNS_VIEW_ROLES}>
                <CampaignsPage />
              </RequireRoles>
            }
          />
          <Route
            path="organizacion/campanas/:id"
            element={
              <RequireRoles roles={CAMPAIGNS_VIEW_ROLES}>
                <CampaignDetailPage />
              </RequireRoles>
            }
          />
          {/* M07 · apadrinamientos RECIBIDOS por la organización (RF17, S2-03).
              Gated a SPONSORSHIP_VIEW_ROLES, calcado del @Roles real de
              SponsorshipsController (GET /sponsorships) — ver nota en nav-items.ts. */}
          <Route
            path="organizacion/apadrinamientos"
            element={
              <RequireRoles roles={SPONSORSHIP_VIEW_ROLES}>
                <SponsorshipsPage />
              </RequireRoles>
            }
          />
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
