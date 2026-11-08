import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Saat pengembangan, permintaan /api diteruskan ke backend lokal (satu asal, cookie lancar).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.jsx', 'src/**/*.test.mjs'] },
});
