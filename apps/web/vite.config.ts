import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Vite's envDir defaults to the project root (this folder, apps/web), but
  // the repo keeps a single .env at the monorepo root (see `pnpm setup:env`).
  // Without this, VITE_* vars set only at the root (e.g. VITE_GOOGLE_CLIENT_ID)
  // are silently invisible to the browser bundle — no error, just undefined.
  envDir: '../..',
  server: {
    port: 5173,
    strictPort: false,
    // TEMPORARY (client demo via a single ngrok tunnel on the free plan, which
    // only allows one public endpoint): proxy /api/* to the local API so the
    // browser only ever talks to ONE origin (the tunnel's), avoiding CORS and
    // cross-origin cookie issues entirely. `allowedHosts: true` disables Vite's
    // DNS-rebinding host check so the ngrok hostname isn't rejected. Revert
    // both once the demo is over — not needed for normal local dev.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
