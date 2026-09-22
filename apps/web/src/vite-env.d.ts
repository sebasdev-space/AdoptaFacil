/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Google OAuth 2.0 Client ID (T-Google-SignIn). Empty/unset in dev renders
   *  a "Continuar con Google (prueba)" button against the FakeIdentityAdapter
   *  instead of loading the real Google Identity Services script. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
