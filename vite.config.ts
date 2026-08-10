import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built page also works from file:// and from any
  // sub-path a render host serves it under.
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets-build',
    sourcemap: true,
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  preview: {
    port: 4173,
    host: '127.0.0.1',
  },
});
