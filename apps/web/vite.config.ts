import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Same origin in development: the API runs on :3000 and Vite proxies /v1 and /health to it.
// Two pages: the panel (index.html) and the user manual (manual/index.html, served at /manual/).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      input: {
        panel: fileURLToPath(new URL('./index.html', import.meta.url)),
        manual: fileURLToPath(new URL('./manual/index.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://127.0.0.1:3000',
      '/health': 'http://127.0.0.1:3000',
    },
  },
});
