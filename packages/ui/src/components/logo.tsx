import logoAsset from '../assets/logo-adoptafacil.jpeg';
import { cn } from '../lib/utils';
import styles from './logo.module.scss';

export interface LogoProps {
  /** `mark` = icon only (cropped from the real asset, for tight spaces like
   * the sidebar/topbar). `full` = the whole lockup (icon + wordmark +
   * tagline baked into the source image), for spaces with room to breathe
   * (public navbar/footer, auth pages). */
  variant?: 'mark' | 'full';
  /** `light` = on a light surface (default). `dark` = on the navy sidebar
   * or any dark surface — the wordmark switches to white/teal-light text. */
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md';
  /** Render the live "AdoptaFácil" text wordmark next to the mark. Ignored
   * for `variant="full"` — the source image already includes its own
   * wordmark. */
  withWordmark?: boolean;
  className?: string;
}

/**
 * AdoptaFácil brand mark — the REAL logo asset
 * (`ejemplos_refactorizacion/LogoAdoptaFacil.jpeg`), never a text initial.
 * `variant="mark"` crops the icon (dog+cat heart glyph) out of that same
 * asset via `background-position`; it does not swap in a different image
 * for light vs. dark — only the surrounding chip/wordmark treatment adapts.
 */
export function Logo({
  variant = 'full',
  tone = 'light',
  size = 'md',
  withWordmark = true,
  className,
}: LogoProps) {
  if (variant === 'full') {
    return (
      <img
        src={logoAsset}
        alt="AdoptaFácil"
        className={cn(styles.logo__full, styles[`logo__full--${size}`], className)}
      />
    );
  }

  return (
    <span className={cn(styles.logo, className)}>
      <span
        // The wordmark next to it already carries the accessible name when
        // shown; announcing "AdoptaFácil" twice would be redundant.
        {...(withWordmark ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'AdoptaFácil' })}
        className={cn(styles.logo__mark, styles[`logo__mark--${size}`])}
        style={{ backgroundImage: `url(${logoAsset})` }}
      />
      {withWordmark && (
        <span
          className={cn(
            styles.logo__wordmark,
            tone === 'dark' ? styles['logo__wordmark--light'] : styles['logo__wordmark--dark'],
          )}
        >
          Adopta
          <span
            className={cn(
              styles['logo__wordmark-accent'],
              tone === 'dark' && styles['logo__wordmark-accent--light'],
            )}
          >
            Fácil
          </span>
        </span>
      )}
    </span>
  );
}
