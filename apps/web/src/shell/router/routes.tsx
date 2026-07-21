import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../auth';
import { AppLayout } from '../layout';
import { HomePage, NotFoundPage, PlaceholderPage } from '../../features/_layout';
import { ForgotPasswordPage, LoginPage, RegisterPage } from '../../features/auth';
import { OrgFormalizationPage, OrgProfilePage } from '../../features/org';
import { OrgPublicPage } from '../../features/portals';

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
      {/* Public organization portal (M01/§M14) — no auth, public fields only. */}
      <Route path="/o/:slug" element={<OrgPublicPage />} />

      {/* Protected — guard first, then the shell layout */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route
            path="adopciones"
            element={
              <PlaceholderPage title="Adopciones" description="Gestión de adopciones del portal." />
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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
