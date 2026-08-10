import { Link } from 'react-router-dom';
import { Brand } from './brand';
import styles from './public-footer.module.scss';

/**
 * Public footer — REFACTOR-VISUAL v2, Fase 3. El mockup de referencia incluye
 * redes sociales y un formulario de suscripción, pero AdoptaFácil no tiene
 * cuentas de redes propias ni un backend de newsletter — inventar esos
 * enlaces/formulario sería fabricar funcionalidad que no existe. Se mantiene
 * honesto: marca + los mismos enlaces reales del navbar + año real.
 */
export function PublicFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footer__row}>
        <Brand inverse />

        <nav aria-label="Enlaces del pie de página" className={styles.footer__links}>
          <Link to="/" className={styles.footer__link}>
            Mascotas
          </Link>
          <Link to="/campanas" className={styles.footer__link}>
            Campañas
          </Link>
          <Link to="/login" className={styles.footer__link}>
            Ingresar
          </Link>
          <Link to="/register" className={styles.footer__link}>
            Publicar mi refugio
          </Link>
        </nav>

        <p className={styles.footer__meta}>AdoptaFácil — rescate animal en Colombia</p>
      </div>
    </footer>
  );
}
