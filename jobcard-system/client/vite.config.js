import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    // The project lives on the Windows drive (/mnt/c) but the dev server runs
    // under WSL, where file-change events don't reach the watcher — so edits
    // never hot-reload. Polling makes Vite notice saved changes.
    watch: {
      usePolling: true,
      interval: 150
    },
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
