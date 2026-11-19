# Tech Stack

Gunakan versi stabil terbaru saat setup dan catat versinya di `package.json`.

## Backend (`backend/`)
- Node.js LTS, ES Modules (`"type": "module"`), semua file `.mjs`, entry `server.mjs`
- Express, `pg` (node-postgres), `zod`, `bcryptjs`, `exceljs` (ekspor/impor Excel), `multer` (unggah berkas, memori), `jsonwebtoken`, `cookie-parser`, `cors`, `helmet`, `express-rate-limit`, `exceljs`, `multer`, `dotenv`
- Dev: `nodemon`; tes memakai `node:test` bawaan Node

## Frontend (`frontend/`)
- React 19 + Vite, Tailwind CSS v4 (plugin `@tailwindcss/vite`; tema di `@theme` pada `src/index.css`, tanpa `tailwind.config.mjs`), `react-router-dom`, `@tanstack/react-query`, `lucide-react`, font `@fontsource-variable/plus-jakarta-sans`
- Komponen `.jsx`; konfigurasi `vite.config.mjs`. Saat dev, Vite meneruskan `/api` ke `localhost:4000`

## Database
- PostgreSQL di Neon (free). Migrasi: file SQL berurutan di `backend/src/db/migrations/`, dijalankan `migrate.mjs`
- Langkah setup (dipandu, konfirmasi tiap langkah): buat akun/project Neon → salin `DATABASE_URL` ke `backend/.env` → `npm run migrate` → `npm run seed`

## Variabel Lingkungan (`backend/.env`, jangan di-commit)
`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `NODE_ENV`, `TZ=Asia/Jakarta`, `SESSION_HOURS` (default 24), `PORT`; akun awal: `SEED_ADMIN_*` dan `SEED_PEMILIK_*` (lihat `backend/.env.example`)
Frontend: `VITE_API_URL`

## Deploy
- Frontend: Cloudflare Pages (root `frontend`, build `npm run build`, output `dist`)
- Backend: Render free web service (root `backend`, start `node server.mjs`, health check `GET /api/health`)
- Database: Neon free
- Catatan: server gratis tidur saat sepi dan butuh sekitar satu menit untuk bangun; frontend perlu menampilkan pesan "Menyiapkan server…". Cookie lintas domain memerlukan `sameSite=none; secure`. Verifikasi syarat tier gratis sebelum deploy.

- Frontend dua halaman (multi-page Vite): landing statis di `/` dan aplikasi React di `/app/`; plugin `frontend/vite/landing-plugin.mjs` merender HTML landing dari `src/landing/content.mjs`, membuat robots.txt/sitemap.xml, dan memberi fallback SPA untuk `/app/*` di dev/preview.
