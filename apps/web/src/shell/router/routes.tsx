import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../auth';
import { AppLayout } from '../layout';
import { HomePage, LoginPage, NotFoundPage, PlaceholderPage } from '../../features/_layout';

/**
 * Route tree for the shell.
 *
 *   /login                     → public
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
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
