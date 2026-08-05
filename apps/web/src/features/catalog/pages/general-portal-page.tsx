import { Link, Navigate } from 'react-router-dom';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { useSession } from '../../../shell/auth';
import { Brand, FullPageLoading } from '../../../shell/layout';
import { GeneralCatalogSection } from '../components/general-catalog-section';

/**
 * Portal GENERAL de entrada de AdoptaFácil (F-LANDING-01, M14, RF25, documento
 * base §8, objetivo #7 "bajar barreras de entrada"). ES la nueva "/" pública:
 * catálogo consolidado de animales de TODAS las organizaciones, acceso a cada
 * organización y al login/registro — nunca el login directo.
 *
 * DISTINTO del portal INDIVIDUAL `/o/:slug` de cada organización (dominio que
 * Sebastián pule ahora con tabs/posiciones) — este archivo no lo toca; solo
 * enlaza a él desde cada tarjeta de animal.
 *
 * Un usuario CON sesión que llega aquí es enviado a su shell autenticado
 * (`/inicio`, antes el índice protegido) — el mismo mecanismo de sesión que
 * usa el resto del shell (`useSession().status`), no un chequeo ad-hoc.
 */
export function GeneralPortalPage() {
  const { status } = useSession();

  if (status === 'loading') {
    return <FullPageLoading label="Verificando tu sesión…" />;
  }

  if (status === 'authenticated') {
    return <Navigate to="/inicio" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-2">
            <Link to="/login" className={cn(buttonVariants({ variant: 'outline' }))}>
              Iniciar sesión
            </Link>
            <Link to="/register" className={cn(buttonVariants())}>
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6">
        <section className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Encuentra a tu próxima mascota</h1>
          <p className="max-w-2xl text-muted-foreground">
            Explora animales en adopción de organizaciones de rescate en toda Colombia. Mirar el
            catálogo no requiere una cuenta — solo para adoptar o donar te pediremos iniciar sesión.
          </p>
        </section>

        <GeneralCatalogSection />
      </main>
    </div>
  );
}
