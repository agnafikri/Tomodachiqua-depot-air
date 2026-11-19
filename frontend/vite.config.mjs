import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import landing from './vite/landing-plugin.mjs';

// Dua halaman: landing page publik di "/" (HTML statis) dan aplikasi di "/app/" (React).
// Saat pengembangan, permintaan /api diteruskan ke backend lokal (satu asal, cookie lancar).
export default defineConfig({
  appType: 'mpa',
  plugins: [landing(), react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        landing: path.resolve(import.meta.dirname, 'index.html'),
        app: path.resolve(import.meta.dirname, 'app/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.jsx', 'src/**/*.test.mjs'] },
});
