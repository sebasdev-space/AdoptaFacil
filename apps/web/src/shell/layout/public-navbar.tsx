import { Link } from 'react-router-dom';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { Brand } from './brand';
import styles from './public-navbar.module.scss';

/**
 * Public top nav (visitantes sin sesión) — REFACTOR-VISUAL v2, Fase 3.
 * Solo enlaza a rutas que existen de verdad hoy: el catálogo general (`/`) y
 * las campañas públicas (`/campanas`). El mockup también muestra "Quiénes
 * somos"/"Voluntariado"/"Transparencia" en esta barra, pero esas pantallas no
 * existen todavía (Transparencia nacional es uno de los 3 placeholders de
 * Fase 12) — enlazar ahí sería navegación a la nada, así que se omiten hasta
 * que la pantalla real exista.
 */
export function PublicNavbar() {
  return (
    <header className={styles.navbar}>
      <div className={styles.navbar__row}>
        <Link to="/" aria-label="Ir al inicio">
          <Brand />
        </Link>

        <nav aria-label="Navegación pública" className={styles.navbar__links}>
          <Link to="/" className={styles.navbar__link}>
            Mascotas
          </Link>
          <Link to="/campanas" className={styles.navbar__link}>
            Campañas
          </Link>
        </nav>

        <div className={styles.navbar__actions}>
          <Link to="/login" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Ingresar
          </Link>
          <Link to="/register" className={cn(buttonVariants({ size: 'sm' }))}>
            Publicar mi refugio
          </Link>
        </div>
      </div>
    </header>
  );
}
