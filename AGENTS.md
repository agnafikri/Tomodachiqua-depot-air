# AGENTS.md — Master Plan untuk Tomodachiqua Depot (Web App Manajemen Depot Air Isi Ulang)

## Project Overview
**App:** Web App Manajemen Depot Air Isi Ulang untuk usaha Tomodachiqua (milik Ayah Agna)
**Goal:** Menggantikan pencatatan manual: order isi ulang, utang pelanggan, stok toren, laporan, keuangan, ekspor/impor Excel.
**Stack:** React + Vite + Tailwind CSS (frontend) • Node.js + Express, semua file `.mjs` (backend) • PostgreSQL (Neon) • deploy gratis: Cloudflare Pages + Render + Neon
**Pengguna:** `PEMILIK` (Ayah, pakai HP) dan `ADMIN` (Agna, pakai komputer)
**Current Phase:** Phase 3 — Utang, Stok Toren, Konsumsi Pribadi (Phase 1 dan 2 selesai)

## How I Should Think
1. **Pahami dulu, baru kode.** Baca file ini, lalu `docs/PRD-DepotAirIsiUlang-MVP.md` dan `docs/TechDesign-DepotAirIsiUlang-MVP.md` bila perlu.
2. **Plan-first.** Usulkan rencana singkat, tunggu persetujuan Agna, baru bangun.
3. **Satu fitur per sesi.** Bangun bertahap, uji, baru lanjut.
4. **Pemilik proyek belum pernah memakai PostgreSQL.** Saat menyentuh database, jelaskan langkahnya satu per satu dan tunggu konfirmasi sebelum lanjut.
5. **Tanyakan bila ragu** tentang aturan bisnis (harga, diskon, stok) daripada menebak.

## Aturan Wajib (tidak boleh dilanggar)
- Semua file JavaScript **backend** berekstensi `.mjs`; `package.json` memakai `"type": "module"`. Entry point backend: `backend/server.mjs` (bukan `index.js`).
- Folder terpisah: `backend/` dan `frontend/`. Komponen React memakai `.jsx`; file konfigurasi non-JSX memakai `.mjs`.
- Role hanya dua: `ADMIN` dan `PEMILIK`.
- Uang disimpan sebagai **integer rupiah**. Waktu disimpan `timestamptz`; laporan harian dikelompokkan di zona **Asia/Jakarta**.
- Seluruh logika harga hanya ada di `backend/src/services/pricing.mjs`; seluruh perhitungan stok hanya di `services/stock.mjs`.
- Server/deploy harus gratis dan boleh untuk komersial.

## Context Files
Muat hanya bila dibutuhkan:
- `agent_docs/tech_stack.md` — detail stack, setup, variabel lingkungan
- `agent_docs/code_patterns.md` — gaya kode dan pola
- `agent_docs/project_brief.md` — aturan bisnis dan aturan proyek tetap
- `agent_docs/product_requirements.md` — ringkasan PRD
- `agent_docs/testing.md` — strategi uji dan loop verifikasi

## Current State
**Last Updated:** 7 November 2026 (Phase 2 revisi 1)
**Working On:** Menunggu persetujuan rencana Phase 3
**Recently Completed:** Phase 2 — migrasi `002_customers_orders.sql` (customers, orders, payments); `services/pricing.mjs` (murni, 24 tes: standar, custom final diantar/diambil, paket beli X bayar Y); API `/api/customers` (GET/POST/PATCH) dan `/api/orders` (preview, POST, GET per rentang tanggal Jakarta, PATCH batalkan); layar Order (HP) dan Pelanggan; backend 49 tes + frontend 15 tes lulus. Revisi 1 (umpan balik uji): login selalu mendarat di Beranda (tanpa `state.from`), layar Order tidak lagi melebar di HP (`grid-cols-1`), tanggal/jam order mengikuti jam server lewat `services/clock.mjs`, sesi 24 jam (`SESSION_HOURS`), teks loading "Memuat data…", utang boleh untuk pelanggan Umum (catatan wajib)
**Perbaikan:** logout sebelumnya tetap di dashboard karena `queryClient.clear()` membuang query `me`; kini `setQueryData(['me'], null)` + `removeQueries` untuk query lain (tes regresi di `frontend/src/auth-flow.test.jsx`). 
**Aturan bisnis terkonfirmasi:** utang boleh untuk pelanggan Umum; karena tanpa nama, catatan (siapa yang berutang) WAJIB; di Phase 3 utang Umum ditampilkan per order (customer_id NULL, dibayar lewat payments.order_id), bukan per pelanggan. Sesi login 24 jam sejak masuk (`SESSION_HOURS`, tidak diperpanjang otomatis). Waktu/tanggal: SELALU lewat `services/clock.mjs` (now, jakartaDate), jangan `now()` di SQL atau jam browser; API `/api/orders` mengembalikan `today` (tanggal server) dan frontend memakainya. harga custom = harga final per galon, sama untuk diantar maupun diambil (pelanggan custom = warung, hampir selalu diantar; layar Order otomatis memilih Diantar untuk pelanggan ber-harga-khusus). Diskon paket dihitung dari harga satuan tersebut. Order lunas membuat satu baris `payments`; utang = total order - pembayaran. Order tidak dihapus, hanya `voided_at` (PEMILIK hanya order hari ini, ADMIN kapan saja). `orders.client_request_id` (UUID) mencegah order ganda saat tombol terketuk dua kali; frontend memakai id yang sama saat kirim ulang setelah gagal. `orders.paid_amount` dari Tech Design sengaja tidak dibuat.
**Fakta depot:** toren sekitar 6000 liter, 19 liter per galon (untuk Phase 3, simpan di `settings`).
**Blocked By:** Pengguna menjalankan `npm run migrate` (migrasi 002) di Neon
**Catatan teknis:** Tailwind v4 dikonfigurasi lewat `@theme` di `frontend/src/index.css` (tidak ada `tailwind.config.mjs`). Pola route: tambahkan router di `backend/src/routes/`, pasang di `src/app.mjs`; pembatasan peran dengan `router.use(requireAuth, requireRole('ADMIN'))`. Semua permintaan POST/PATCH/DELETE wajib header `X-Requested-With: tomodachiqua` (sudah otomatis di `frontend/src/lib/api.mjs`).

## Roadmap
- [x] **Phase 1 — Foundation:** scaffold `backend/` dan `frontend/`, koneksi PostgreSQL (Neon), migrasi dasar, seed ADMIN dan PEMILIK, login dan pembatasan peran
- [x] **Phase 2 — Pelanggan, Harga, Order:** CRUD pelanggan, harga custom, diskon paket, form order (mobile-first), pengujian `pricing.mjs`
- [ ] **Phase 3 — Utang, Stok Toren, Konsumsi Pribadi:** daftar utang dan pembayaran, input air masuk dan koreksi, perkiraan habis
- [ ] **Phase 4 — Laporan dan Keuangan:** laporan harian/mingguan/bulanan, pengeluaran, ringkasan keuangan
- [ ] **Phase 5 — Excel:** ekspor laporan, impor data (khusus ADMIN, validasi + dry-run)
- [ ] **Phase 6 — Deploy dan Dokumentasi:** deploy Neon, Render, Cloudflare Pages; uji di HP Ayah; perbarui `README.md` (cara maintenance, menambah kode/fitur, optimalisasi)

## Commands
- Backend: `cd backend && npm run dev` • `npm test` • `npm run migrate` • `npm run seed`
- Frontend: `cd frontend && npm run dev` • `npm run build` • `npm run preview` • `npm test` (vitest + jsdom; lint belum dipasang)

## What NOT To Do
- Jangan menambah fitur di luar phase aktif atau di luar PRD.
- Jangan membuat file `.js` baru di backend; pakai `.mjs`.
- Jangan menaruh logika harga atau stok di komponen React atau route handler.
- Jangan commit `.env`, kata sandi, atau `DATABASE_URL`.
- Jangan melewati tes untuk perubahan "kecil", terutama harga, utang, dan stok.
- Jangan memakai pustaka usang atau layanan berbayar tanpa persetujuan Agna.
- Jangan menjalankan migrasi destruktif pada database produksi tanpa konfirmasi eksplisit.

## Update Protocol
Setelah tiap fitur selesai: perbarui bagian **Current State** dan centang **Roadmap**. Di akhir proyek, perbarui `README.md`.
