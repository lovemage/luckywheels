import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at the root of the superadmin service's own domain, so base is '/'.
// Dev proxy points at a locally-running superadmin server. Run it on 3002 to
// avoid clashing with the member/admin server on 3001:
//   PORT=3002 npm run superadmin:dev   (in server/)
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3002',
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5175,
  },
});
