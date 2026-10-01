/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Google OAuth 2.0 Client ID (T-Google-SignIn). Empty/unset in dev renders
   *  a "Continuar con Google (prueba)" button against the FakeIdentityAdapter
   *  instead of loading the real Google Identity Services script. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** MercadoPago PUBLIC key (T-OrdersAPI, Checkout API/Orders) — NOT secret,
   *  safe to expose client-side (same pattern as VITE_GOOGLE_CLIENT_ID above;
   *  mirrors the server's own MERCADOPAGO_PUBLIC_KEY). Empty/unset in dev
   *  renders a "pago con tarjeta no disponible" message instead of loading
   *  MercadoPago's Card Payment Brick SDK. */
  readonly VITE_MERCADOPAGO_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
