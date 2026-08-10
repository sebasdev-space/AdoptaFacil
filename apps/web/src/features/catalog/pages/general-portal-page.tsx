import { Link, Navigate } from 'react-router-dom';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { useSession } from '../../../shell/auth';
import { FullPageLoading, PublicFooter, PublicNavbar } from '../../../shell/layout';
import {
  GENERAL_CATALOG_HEADING_ID,
  GeneralCatalogSection,
} from '../components/general-catalog-section';

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
      <PublicNavbar />

      <main>
        {/* Hero con marca (REFACTOR-VISUAL Fase C1) — franja navy a todo el ancho,
            igual que el hero del mockup de referencia. El copy es el mismo que
            ya existía (nunca se inventaron cifras: el mockup ilustra "3.482
            adopciones formalizadas" etc., pero esos números no existen en
            ningún endpoint público — se omiten en vez de fabricarse). */}
        <section className="bg-navy px-4 py-16 text-white sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl space-y-6">
            <h1 className="max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Encuentra a tu <span className="text-brand-teal">próxima mascota</span>
            </h1>
            <p className="max-w-2xl text-white/70">
              Explora animales en adopción de organizaciones de rescate en toda Colombia. Mirar el
              catálogo no requiere una cuenta — solo para adoptar o donar te pediremos iniciar
              sesión.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={`#${GENERAL_CATALOG_HEADING_ID}`}
                className={cn(buttonVariants({ size: 'lg' }))}
              >
                Ver mascotas en adopción
              </a>
              <Link
                to="/register"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'border-white/20 bg-white/5 text-white hover:border-white hover:bg-white/10 hover:text-white',
                )}
              >
                Soy una organización
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6">
          <GeneralCatalogSection />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
