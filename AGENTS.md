# AGENTS.md — Master Plan untuk Tomodachiqua Depot (Web App Manajemen Depot Air Isi Ulang)

## Project Overview
**App:** Web App Manajemen Depot Air Isi Ulang untuk usaha Tomodachiqua (milik Ayah Agna)
**Goal:** Menggantikan pencatatan manual: order isi ulang, utang pelanggan, stok toren, laporan, keuangan, ekspor/impor Excel.
**Stack:** React + Vite + Tailwind CSS (frontend) • Node.js + Express, semua file `.mjs` (backend) • PostgreSQL (Neon) • deploy gratis: Cloudflare Pages + Render + Neon
**Pengguna:** `PEMILIK` (Ayah, pakai HP) dan `ADMIN` (Agna, pakai komputer)
**Current Phase:** Phase 4B — Upah harian dan slip (Phase 1 sampai 3 dan 4A selesai)

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
**Last Updated:** 8 November 2026 (Phase 4A selesai)
**Working On:** Menunggu pengguna menjalankan migrasi 005 dan menguji Phase 4A, lalu persetujuan rencana Phase 4B (upah harian + slip)
**Recently Completed:** Phase 4A — migrasi `005_expenses.sql`; `services/period.mjs` (periode harian/mingguan Senin-Minggu/bulanan, murni), `services/reports.mjs` (laporan + keuangan), `services/expenses.mjs`, `services/dates.mjs` (`isCalendarDate`, tidak melempar); API `GET /api/reports`, `GET /api/finance`, `GET/POST /api/expenses`, `PATCH /api/expenses/:id`; layar Laporan, Keuangan, komponen `PeriodBar`; backend 133 tes + frontend 45 tes lulus; tampilan HP/desktop diukur di browser headless. Perbaikan terbawa: filter tanggal `/api/orders` kini menolak tanggal yang tidak ada di kalender (sebelumnya 500)
**Perbaikan:** logout sebelumnya tetap di dashboard karena `queryClient.clear()` membuang query `me`; kini `setQueryData(['me'], null)` + `removeQueries` untuk query lain (tes regresi di `frontend/src/auth-flow.test.jsx`). 
**Aturan bisnis terkonfirmasi:** utang boleh untuk pelanggan Umum; karena tanpa nama, catatan (siapa yang berutang) WAJIB; di Phase 3 utang Umum ditampilkan per order (customer_id NULL, dibayar lewat payments.order_id), bukan per pelanggan. Sesi login 24 jam sejak masuk (`SESSION_HOURS`, tidak diperpanjang otomatis). Waktu/tanggal: SELALU lewat `services/clock.mjs` (now, jakartaDate), jangan `now()` di SQL atau jam browser; API `/api/orders` mengembalikan `today` (tanggal server) dan frontend memakainya. harga custom = harga final per galon, sama untuk diantar maupun diambil (pelanggan custom = warung, hampir selalu diantar; layar Order otomatis memilih Diantar untuk pelanggan ber-harga-khusus). Diskon paket dihitung dari harga satuan tersebut. Order lunas membuat satu baris `payments`; utang = total order - pembayaran. Order tidak dihapus, hanya `voided_at` (PEMILIK hanya order hari ini, ADMIN kapan saja). `orders.client_request_id` (UUID) mencegah order ganda saat tombol terketuk dua kali; frontend memakai id yang sama saat kirim ulang setelah gagal. `orders.paid_amount` dari Tech Design sengaja tidak dibuat.
**Laporan dan keuangan (Phase 4A):** periode dihitung di server (`period.mjs`), frontend hanya meneruskan `period` dan `date` (kosong = hari ini menurut server; tombol geser memakai `prevDate`/`nextDate` dari server; tanggal masa depan ditolak 400). Definisi: nilai penjualan = total order tidak batal; UANG MASUK (angka utama) = payments.paid_at (terbagi: dibayar saat order = batch_id NULL, pembayaran utang = batch_id terisi); utang baru = total order dikurangi pembayaran saat order; pelunasan = pembayaran utang pada periode itu (termasuk untuk order lama); keringanan = debt_waivers (BUKAN uang masuk); saldo = uang masuk - pengeluaran periode itu (belum ada saldo awal/kas kumulatif). Kekekalan yang diuji: utang akhir = utang awal + utang baru - pelunasan - keringanan. Pengeluaran bertanggal (`spent_date`, boleh lampau, tidak boleh masa depan); batal = `voided_at` (PEMILIK hanya yang dicatat hari ini). Kategori pengeluaran di `services/expenseCategories.mjs`; kategori UPAH ('Gaji dan upah') masih boleh manual sampai Phase 4B, lalu hanya diisi otomatis dari slip upah. **Upah harian (Phase 4B, rencana):** TIDAK ada tarif tetap; nominal tiap karyawan ditentukan pemilik per hari berdasarkan uang yang didapat hari itu (layar catat upah menampilkan uang masuk hari itu sebagai acuan). Tanpa upah bulanan. Karyawan: nama, telepon, aktif. Slip per (karyawan, tanggal), dibayar tunai di hari yang sama, dicetak lewat cetak browser + bagikan teks; upah otomatis menjadi pengeluaran di Keuangan (tanpa input ganda).
**Stok toren (Phase 3):** model satu garis waktu. Sisa = koreksi terakhir (liters_after) + air masuk sesudah koreksi - (galon order fisik, termasuk galon gratis paket, + konsumsi pribadi) x 19 L. Tiap catatan punya `occurred_at`: hari ini = saat dicatat, tanggal lampau = pukul 12.00 WIB (`clock.atDate`). Catatan yang terjadi sebelum koreksi terakhir tidak dihitung (sudah tercermin di angka koreksi). Koreksi stok tidak bisa dibatalkan, hanya diganti koreksi baru. Perkiraan habis = sisa / rata-rata galon per hari dalam jendela 7 hari (dibagi minimal 1 hari bila data < 7 hari, jadi kasar di hari-hari awal). Level: LOW (oranye) bila < 3 hari, CRITICAL (merah) bila < 1 hari atau sisa <= 0. Tanpa koreksi awal: status NEEDS_ADJUSTMENT. **Keringanan utang:** bila pembayaran < sisa utang, Pemilik boleh menganggap sisanya lunas dengan catatan alasan WAJIB (`waiveRemaining` + `note` di POST /api/payments). Sisa dicatat di tabel `debt_waivers` per order (satu batch dengan pembayarannya), BUKAN di `payments`: pemasukan/pendapatan = hanya `payments` (uang diterima); keringanan dilaporkan terpisah (Phase 4 wajib menampilkan total keringanan per periode). Utang = total - payments - debt_waivers. Pembayaran harus >= Rp 1 (tidak ada penghapusan utang tanpa bayar). Membatalkan batch pembayaran atau order ikut membatalkan keringanannya. Untuk pelanggan bernama, keringanan berlaku untuk seluruh sisa utangnya (order tertua dibayar dulu). **Utang (Phase 3):** utang = total order tidak batal - pembayaran tidak batal, tidak disimpan terpisah; pembayaran pelanggan bernama dialokasikan ke order tertua dulu (customerId), utang Umum dibayar per order (orderId); kelebihan bayar ditolak (OVERPAY); pembatalan pembayaran per batch (PEMILIK hanya hari ini). Tes yang memakai tabel global (stok) memakai jam palsu tahun 2031 (`tests/helpers.mjs`, `at()`).
**Fakta depot:** toren sekitar 6000 liter, 19 liter per galon (untuk Phase 3, simpan di `settings`).
**Blocked By:** Pengguna menjalankan `npm run migrate` (migrasi 005) di Neon
**Catatan teknis:** Tailwind v4 dikonfigurasi lewat `@theme` di `frontend/src/index.css` (tidak ada `tailwind.config.mjs`). Pola route: tambahkan router di `backend/src/routes/`, pasang di `src/app.mjs`; pembatasan peran dengan `router.use(requireAuth, requireRole('ADMIN'))`. Semua permintaan POST/PATCH/DELETE wajib header `X-Requested-With: tomodachiqua` (sudah otomatis di `frontend/src/lib/api.mjs`).

## Roadmap
- [x] **Phase 1 — Foundation:** scaffold `backend/` dan `frontend/`, koneksi PostgreSQL (Neon), migrasi dasar, seed ADMIN dan PEMILIK, login dan pembatasan peran
- [x] **Phase 2 — Pelanggan, Harga, Order:** CRUD pelanggan, harga custom, diskon paket, form order (mobile-first), pengujian `pricing.mjs`
- [x] **Phase 3 — Utang, Stok Toren, Konsumsi Pribadi:** daftar utang dan pembayaran, input air masuk dan koreksi, perkiraan habis
- [x] **Phase 4A — Laporan dan Keuangan:** laporan harian/mingguan/bulanan, pengeluaran, ringkasan keuangan
- [ ] **Phase 4B — Upah harian dan slip:** karyawan, catat upah harian (nominal ditentukan pemilik), slip cetak/bagikan, terhubung ke Keuangan
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
