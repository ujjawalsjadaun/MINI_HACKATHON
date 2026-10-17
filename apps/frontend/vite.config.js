import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the backend runs on its own port; the browser talks only to Vite, which forwards the API
// and the uploaded photos. In production the backend serves the built files itself, so nothing is forwarded.
const backend = process.env.BACKEND_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': backend, '/uploads': backend },
  },
  build: { outDir: 'dist', sourcemap: false },
});
