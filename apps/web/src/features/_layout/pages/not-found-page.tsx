import { Link } from 'react-router-dom';
import { buttonVariants } from '@adoptafacil/ui';
import { PageContainer } from '../page';

/** 404 for unknown routes, rendered inside the shell layout. */
export function NotFoundPage() {
  return (
    <PageContainer>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-5xl font-bold text-primary">404</p>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Página no encontrada</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            La sección que buscas no existe o aún no está disponible.
          </p>
        </div>
        <Link to="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Volver al inicio
        </Link>
      </div>
    </PageContainer>
  );
}
