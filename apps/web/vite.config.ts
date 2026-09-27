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
  },
});
