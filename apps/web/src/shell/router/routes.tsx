import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../auth';
import { AppLayout } from '../layout';
import { HomePage, NotFoundPage, PlaceholderPage } from '../../features/_layout';
import { ForgotPasswordPage, LoginPage, RegisterPage } from '../../features/auth';
import { OrgFormalizationPage, OrgProfilePage } from '../../features/org';
import { OrgPublicPage, PortalThemePage } from '../../features/portals';
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
          {/* M14 · portal personalization by tokens (T-027, Owner/Admin gated). */}
          <Route path="organizacion/portal" element={<PortalThemePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
