import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@adoptafacil/ui';
import styles from './google-sign-in-button.module.scss';

export interface GoogleSignInButtonProps {
  /** Called with the raw ID token (real Google credential, or the fake test
   *  token in dev) once the user picks an account. */
  onCredential: (idToken: string) => void | Promise<void>;
  disabled?: boolean;
}

/** Minimal shape of the `google.accounts.id` API this component uses (Google
 *  Identity Services, loaded from the CDN script — no npm types needed for
 *  this small a surface). */
interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GIS_SCRIPT_ID = 'google-identity-services';

/** Load the Google Identity Services script once (shared across every mount
 *  of this component on the page) and resolve when it's ready. */
function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google script')));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google script'));
    document.head.appendChild(script);
  });
}

/**
 * "Continuar con Google" (T-Google-SignIn). With a real `VITE_GOOGLE_CLIENT_ID`
 * configured, renders the REAL Google Identity Services button and forwards
 * its ID token to `onCredential`. With no Client ID (the client hasn't
 * provided one yet — dev/test default), renders a plain button that prompts
 * for a test email and calls `onCredential` with the FakeIdentityAdapter's
 * documented token format (`fake:<email>:<name>`), so the WHOLE flow —
 * auto-link or new lightweight Person account — can be exercised locally
 * with NO real Google account, against `AUTH_IDENTITY_DRIVER=fake` on the API.
 */
export function GoogleSignInButton({ onCredential, disabled }: GoogleSignInButtonProps) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptError, setScriptError] = useState(false);
  const buttonId = useId();

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    void loadGoogleIdentityServices()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => void onCredential(response.credential),
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          width: 320,
        });
      })
      .catch(() => {
        if (!cancelled) setScriptError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential]);

  if (clientId) {
    if (scriptError) {
      return <p className={styles.error}>No pudimos cargar el inicio de sesión con Google.</p>;
    }
    return <div ref={containerRef} data-testid="google-sign-in-container" />;
  }

  // Dev/test fallback: no real Client ID configured (see .env.example).
  const handleTestSignIn = () => {
    const email = window.prompt(
      'Modo prueba (sin credenciales reales de Google): correo a usar',
      'nueva.persona@example.com',
    );
    if (!email) return;
    const name = window.prompt('Nombre para mostrar', 'Persona de Prueba') || email;
    void onCredential(`fake:${email.trim()}:${name.trim()}`);
  };

  return (
    <div className={styles.wrapper}>
      <Button
        type="button"
        variant="outline"
        className={styles.button}
        disabled={disabled}
        onClick={handleTestSignIn}
        id={buttonId}
        data-testid="google-sign-in-fake-button"
      >
        Continuar con Google (prueba)
      </Button>
      <p className={styles.hint}>
        Sin credenciales reales de Google configuradas — este botón usa el adaptador de prueba.
      </p>
    </div>
  );
}
