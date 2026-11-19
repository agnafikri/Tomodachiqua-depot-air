# AGENTS.md — Master Plan untuk Tomodachiqua Depot (Web App Manajemen Depot Air Isi Ulang)

## Project Overview
**App:** Web App Manajemen Depot Air Isi Ulang untuk usaha Tomodachiqua (milik Ayah Agna)
**Goal:** Menggantikan pencatatan manual: order isi ulang, utang pelanggan, stok toren, laporan, keuangan, ekspor/impor Excel.
**Stack:** React + Vite + Tailwind CSS (frontend) • Node.js + Express, semua file `.mjs` (backend) • PostgreSQL (Neon) • deploy gratis: Cloudflare Pages + Render + Neon
**Pengguna:** `PEMILIK` (Ayah, pakai HP) dan `ADMIN` (Agna, pakai komputer)
**Current Phase:** Phase 5C — Rapikan desain Excel, lalu Phase 6 — Deploy dan README (Phase 1 sampai 5B selesai)

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
**Last Updated:** 15 November 2026 (Phase 5B selesai)
**Working On:** Menunggu pengguna menjalankan `npm run migrate` (migrasi 008) dan menguji Phase 5B; konten landing (WhatsApp, layanan, foto) menunggu dari pengguna
**Recently Completed:** Phase 5B — landing page publik + permintaan layanan. Frontend kini DUA halaman: landing statis di `/` (`frontend/index.html`, HTML dibuat saat build dari `src/landing/content.mjs` oleh `vite/landing-plugin.mjs`) dan aplikasi React di `/app/` (`frontend/app/index.html`, `BrowserRouter basename="/app"`, login di `/app/login`). Migrasi `008_service_requests.sql`; API publik `POST /api/public/service-requests` (tanpa login; header X-Requested-With wajib; batas 5/jam/IP; kolom jebakan `website`; nomor dinormalkan ke 628…; IP disimpan hash 16 hex); API aplikasi `/api/service-requests` (GET daftar+jumlah per status, PATCH status/catatan internal, DELETE ADMIN-only; PEMILIK dan ADMIN boleh melihat); `/api/summary` memuat `serviceRequests.new`; layar Layanan + pemberitahuan di Beranda; backend 208 tes + frontend 105 tes lulus; landing diukur di browser 320-1280 px (tanpa overflow), halaman ±14 KB terkompresi
**Perbaikan:** logout sebelumnya tetap di dashboard karena `queryClient.clear()` membuang query `me`; kini `setQueryData(['me'], null)` + `removeQueries` untuk query lain (tes regresi di `frontend/src/auth-flow.test.jsx`). 
**Aturan bisnis terkonfirmasi:** utang boleh untuk pelanggan Umum; karena tanpa nama, catatan (siapa yang berutang) WAJIB; di Phase 3 utang Umum ditampilkan per order (customer_id NULL, dibayar lewat payments.order_id), bukan per pelanggan. Sesi login 24 jam sejak masuk (`SESSION_HOURS`, tidak diperpanjang otomatis). Waktu/tanggal: SELALU lewat `services/clock.mjs` (now, jakartaDate), jangan `now()` di SQL atau jam browser; API `/api/orders` mengembalikan `today` (tanggal server) dan frontend memakainya. harga custom = harga final per galon, sama untuk diantar maupun diambil (pelanggan custom = warung, hampir selalu diantar; layar Order otomatis memilih Diantar untuk pelanggan ber-harga-khusus). Diskon paket dihitung dari harga satuan tersebut. Order lunas membuat satu baris `payments`; utang = total order - pembayaran. Order tidak dihapus, hanya `voided_at` (PEMILIK hanya order hari ini, ADMIN kapan saja). `orders.client_request_id` (UUID) mencegah order ganda saat tombol terketuk dua kali; frontend memakai id yang sama saat kirim ulang setelah gagal. `orders.paid_amount` dari Tech Design sengaja tidak dibuat.
**Laporan dan keuangan (Phase 4A):** periode dihitung di server (`period.mjs`), frontend hanya meneruskan `period` dan `date` (kosong = hari ini menurut server; tombol geser memakai `prevDate`/`nextDate` dari server; tanggal masa depan ditolak 400). Definisi: nilai penjualan = total order tidak batal; UANG MASUK (angka utama) = payments.paid_at (terbagi: dibayar saat order = batch_id NULL, pembayaran utang = batch_id terisi); utang baru = total order dikurangi pembayaran saat order; pelunasan = pembayaran utang pada periode itu (termasuk untuk order lama); keringanan = debt_waivers (BUKAN uang masuk); saldo = uang masuk - pengeluaran periode itu (belum ada saldo awal/kas kumulatif). Kekekalan yang diuji: utang akhir = utang awal + utang baru - pelunasan - keringanan. Pengeluaran bertanggal (`spent_date`, boleh lampau, tidak boleh masa depan); batal = `voided_at` (PEMILIK hanya yang dicatat hari ini). Kategori pengeluaran di `services/expenseCategories.mjs`; kategori UPAH ('Gaji dan upah') masih boleh manual sampai Phase 4B, lalu hanya diisi otomatis dari slip upah. **Landing page + layanan (Phase 5B):** merek publik = Tomodachiqua (logo belum ada; sementara tanda tetesan). Isi landing HANYA dari `src/landing/content.mjs` (bagian kosong tidak tampil; jangan mengarang testimoni/angka/harga/sertifikasi; tes memeriksa kata klaim terlarang). SEO: judul <= 70 karakter, deskripsi <= 170, JSON-LD LocalBusiness (areaServed Bandung, Cimahi; tanpa rating), canonical/og:url + `sitemap.xml` hanya bila alamat situs diketahui (`siteUrl` atau env `VITE_SITE_URL` saat build), `robots.txt` selalu (Disallow /app/), aplikasi `noindex`. Formulir: JS murni (`form.mjs`), validasi sama dengan server, `clientRequestId` tetap saat kirim ulang, bila server tidak terjangkau tampil tautan WhatsApp berisi data pengunjung (karena server gratis bisa tidur). Dev/preview: plugin menambahkan fallback SPA untuk `/app/*`; produksi (Cloudflare Pages) memakai `public/_redirects` (`/app/*  /app/index.html  200`, PERLU diverifikasi saat deploy). Tautan lama `/login` kini `/app/login`. Pelajaran layout: lebar header HP harus diukur dengan konten terisi (WhatsApp) karena label tombol panjang pernah membuat halaman melebar di 360 px.
**Ekspor/impor Excel (Phase 5):** unduhan lewat fetch+blob (cookie sesi), nama berkas dari `Content-Disposition` (CORS `exposedHeaders`). Ekspor: uang = angka (format #,##0), tanggal = tanggal Excel, baris Total = rumus SUM dengan `result`; laporan periode memuat Ringkasan/Order/Pembayaran/Keringanan/Pengeluaran/Upah/Utang saat ini; cadangan lengkap memuat semua data (termasuk yang batal, ditandai), TANPA akun/password. Impor: tiga jenis (Pelanggan, Order lama, Pengeluaran), template di lembar data + lembar Petunjuk, header baris 1, baris Excel dilaporkan apa adanya. Alur: `/check` (dry-run, tidak menyimpan; mengembalikan galat per baris+kolom, ringkasan, pratinjau, peringatan) lalu `/:slug` (periksa ulang seluruh berkas, simpan SEMUA atau tidak sama sekali dalam satu transaksi, insert massal lewat UNNEST). Harga order lama dihitung `pricing.mjs` memakai aturan pelanggan SAAT INI (tanpa kolom harga); order lunas/dibayar membuat `payments` (paid_at = waktu order); pelanggan harus sudah ada (impor Pelanggan dulu); utang Umum wajib catatan; order bertanggal setelah koreksi stok terakhir mengurangi stok (diberi peringatan). Pengaman: hash SHA-256 berkas (`import_batches.file_hash`, unik selama belum dibatalkan), batas 5 MB dan 5.000 baris, hanya .xlsx (magic bytes PK). Batal impor menandai order (+pembayaran, keringanan) dan pengeluaran batal; pelanggan hasil impor TIDAK dihapus. Tes membangun berkas dengan `tests/xlsx.mjs`.
**Upah harian (Phase 4B, selesai):** TIDAK ada tarif tetap; nominal tiap karyawan ditentukan pemilik per hari berdasarkan uang yang didapat hari itu (layar catat upah menampilkan uang masuk hari itu sebagai acuan). Tanpa upah bulanan. Karyawan: nama, telepon, aktif. Slip per (karyawan, tanggal) unik selama tidak batal (partial unique index; slip batal boleh dibuat ulang), satu ketukan "Simpan dan bayar" = satu batch (`batch_id`, transaksi atomik, anti ganda lewat clientRequestId + advisory lock), dibayar tunai di hari yang sama; tanggal lampau boleh, masa depan ditolak. Upah = pengeluaran: `reports.mjs` menjumlahkan manual + wage_slips (kategori 'Gaji dan upah' digabung), rekap per karyawan di `/api/finance` (`wages.byEmployee`) hanyalah penjumlahan slip harian, BUKAN gaji bulanan. Phase 5 wajib menyertakan slip/rekap upah di ekspor Excel.
**Stok toren (Phase 3):** model satu garis waktu. Sisa = koreksi terakhir (liters_after) + air masuk sesudah koreksi - (galon order fisik, termasuk galon gratis paket, + konsumsi pribadi) x 19 L. Tiap catatan punya `occurred_at`: hari ini = saat dicatat, tanggal lampau = pukul 12.00 WIB (`clock.atDate`). Catatan yang terjadi sebelum koreksi terakhir tidak dihitung (sudah tercermin di angka koreksi). Koreksi stok tidak bisa dibatalkan, hanya diganti koreksi baru. Perkiraan habis = sisa / rata-rata galon per hari dalam jendela 7 hari (dibagi minimal 1 hari bila data < 7 hari, jadi kasar di hari-hari awal). Level: LOW (oranye) bila < 3 hari, CRITICAL (merah) bila < 1 hari atau sisa <= 0. Tanpa koreksi awal: status NEEDS_ADJUSTMENT. **Keringanan utang:** bila pembayaran < sisa utang, Pemilik boleh menganggap sisanya lunas dengan catatan alasan WAJIB (`waiveRemaining` + `note` di POST /api/payments). Sisa dicatat di tabel `debt_waivers` per order (satu batch dengan pembayarannya), BUKAN di `payments`: pemasukan/pendapatan = hanya `payments` (uang diterima); keringanan dilaporkan terpisah (Phase 4 wajib menampilkan total keringanan per periode). Utang = total - payments - debt_waivers. Pembayaran harus >= Rp 1 (tidak ada penghapusan utang tanpa bayar). Membatalkan batch pembayaran atau order ikut membatalkan keringanannya. Untuk pelanggan bernama, keringanan berlaku untuk seluruh sisa utangnya (order tertua dibayar dulu). **Utang (Phase 3):** utang = total order tidak batal - pembayaran tidak batal, tidak disimpan terpisah; pembayaran pelanggan bernama dialokasikan ke order tertua dulu (customerId), utang Umum dibayar per order (orderId); kelebihan bayar ditolak (OVERPAY); pembatalan pembayaran per batch (PEMILIK hanya hari ini). Tes yang memakai tabel global (stok) memakai jam palsu tahun 2031 (`tests/helpers.mjs`, `at()`).
**Fakta depot:** toren sekitar 6000 liter, 19 liter per galon (untuk Phase 3, simpan di `settings`).
**Blocked By:** Pengguna menjalankan `npm install` (exceljs, multer) dan `npm run migrate` (migrasi 005-008) di komputernya/Neon
**Catatan teknis:** Tailwind v4 dikonfigurasi lewat `@theme` di `frontend/src/index.css` (tidak ada `tailwind.config.mjs`). Pola route: tambahkan router di `backend/src/routes/`, pasang di `src/app.mjs`; pembatasan peran dengan `router.use(requireAuth, requireRole('ADMIN'))`. Semua permintaan POST/PATCH/DELETE wajib header `X-Requested-With: tomodachiqua` (sudah otomatis di `frontend/src/lib/api.mjs`).

## Roadmap
- [x] **Phase 1 — Foundation:** scaffold `backend/` dan `frontend/`, koneksi PostgreSQL (Neon), migrasi dasar, seed ADMIN dan PEMILIK, login dan pembatasan peran
- [x] **Phase 2 — Pelanggan, Harga, Order:** CRUD pelanggan, harga custom, diskon paket, form order (mobile-first), pengujian `pricing.mjs`
- [x] **Phase 3 — Utang, Stok Toren, Konsumsi Pribadi:** daftar utang dan pembayaran, input air masuk dan koreksi, perkiraan habis
- [x] **Phase 4A — Laporan dan Keuangan:** laporan harian/mingguan/bulanan, pengeluaran, ringkasan keuangan
- [x] **Phase 4B — Upah harian dan slip:** karyawan, catat upah harian (nominal ditentukan pemilik), slip cetak/bagikan, terhubung ke Keuangan
- [x] **Phase 5 — Excel:** ekspor laporan, impor data (khusus ADMIN, validasi + dry-run)
- [x] **Phase 5B — Landing page dan permintaan layanan:** landing statis, formulir publik, layar Layanan untuk PEMILIK/ADMIN
- [ ] **Phase 5C — Rapikan desain output Excel** (diminta pengguna, setelah 5B)
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
