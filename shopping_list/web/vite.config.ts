import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' so the app works behind Home Assistant ingress (/api/hassio_ingress/<token>/).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8099' } },
});
