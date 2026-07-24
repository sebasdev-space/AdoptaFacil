import { Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireRoles } from '../auth';
import { AppLayout } from '../layout';
import { ANIMAL_VIEW_ROLES, ORG_DOCUMENTS_ROLES, PLATFORM_DOCUMENTS_ROLES } from '../navigation';
import { AnimalDetailPage } from '../pages/animal-detail-page';
import { HomePage, NotFoundPage, PlaceholderPage } from '../../features/_layout';
import { ForgotPasswordPage, LoginPage, RegisterPage } from '../../features/auth';
import {
  OrgDocumentsPage,
  OrgFormalizationPage,
  OrgProfilePage,
  PlatformDocumentsReviewPage,
} from '../../features/org';
import { OrgPublicPage, PortalThemePage } from '../../features/portals';
import { AnimalsPage, RemindersInboxPage } from '../../features/animals';
import { AdoptionRequestPage, AdoptionsKanbanPage } from '../../features/adoptions';

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
      {/* Public rich organization portal (§M14, T-026) — no auth, public fields
          only: real profile + placeholder sections wired per docs/TASKS.md. */}
      <Route path="/o/:slug" element={<OrgPublicPage />} />

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
          <Route
            path="donaciones"
            element={
              <PlaceholderPage title="Donaciones" description="Donaciones y aportes al portal." />
            }
          />
          <Route
            path="campanas"
            element={
              <PlaceholderPage title="Campañas" description="Campañas de recaudación y difusión." />
            }
          />
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
