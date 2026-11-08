# Technical Design — Web App Manajemen Depot Air Isi Ulang "Tomodachiqua" (MVP)

*Langkah 3 alur vibe-coding (skill vibe-techdesign). Simpan sebagai `docs/TechDesign-DepotAirIsiUlang-MVP.md`. Rujukan: `docs/PRD-DepotAirIsiUlang-MVP.md`. Pengecekan harga/syarat hosting dilakukan 6 November 2026; verifikasi ulang di situs resmi masing-masing sebelum deploy.*

## Ringkasan Konteks (dari PRD)

- **Pengguna:** PEMILIK (Ayah, HP) dan ADMIN (Agna, komputer).
- **Level teknis:** Developer/in-between; stack sudah ditentukan: Node.js, React, Tailwind CSS, GitHub, PostgreSQL.
- **Budget:** Rp 0; hosting harus gratis dan boleh untuk komersial.
- **Alat bantu AI untuk build:** Claude Code.
- **Konvensi wajib:** semua file JavaScript backend `.mjs` (ES Modules); folder `backend/` dan `frontend/` terpisah; entry backend `server.mjs`.

## 1. Recommended Approach

**Arsitektur: SPA React + REST API Node.js + PostgreSQL terkelola (3 layanan gratis terpisah).**

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Frontend | React + Vite + Tailwind CSS, di **Cloudflare Pages** | Gratis, bandwidth statis tak terbatas, boleh komersial |
| Backend | Node.js 22 LTS + **Express**, file `.mjs`, di **Render** (free web service) | Gratis tanpa kartu kredit, boleh komersial, deploy otomatis dari GitHub |
| Database | **PostgreSQL di Neon** (free) | Gratis tanpa kartu, boleh komersial, tidak kedaluwarsa, ada riwayat pemulihan |
| Akses data | `pg` (node-postgres) + file migrasi SQL | Paling sederhana dan transparan untuk pemula PostgreSQL; mudah dipandu |
| Validasi | `zod` | Validasi input API dan form |
| Auth | JWT di cookie `httpOnly` + `bcryptjs` | Sederhana, aman untuk 2 pengguna |
| Excel | `exceljs` (backend) | Ekspor dan impor `.xlsx` dengan validasi di server |

**Mengapa tiga layanan terpisah:** Render memberi database Postgres gratis yang kedaluwarsa dalam 30 hari, sehingga database dipisah ke Neon yang tidak kedaluwarsa.

## 2. Alternative Options

| Keputusan | Opsi | Kelebihan | Kekurangan | Keputusan |
| --- | --- | --- | --- | --- |
| **Database** | Neon | Gratis tanpa batas waktu, tanpa kartu, komersial diizinkan | Compute tidur setelah 5 menit idle (query pertama lambat); riwayat pemulihan hanya 6 jam | **Dipilih** |
|  | Supabase | Gratis, 500 MB, fitur lengkap | Proyek dijeda setelah 1 minggu tidak aktif; tanpa backup di tier gratis | Cadangan |
|  | Render Postgres | Satu platform dengan backend | Kedaluwarsa 30 hari | Ditolak |
| **Backend host** | Render | Tanpa kartu, komersial diizinkan, mudah | Tidur setelah 15 menit idle, bangun ± 1 menit | **Dipilih** |
|  | Koyeb | Tidur setelah 1 jam | Butuh kartu dengan hold | Cadangan |
|  | Cloudflare Workers | Cepat, gratis | Bukan Node.js penuh; batas CPU 10 ms/request | Ditolak |
| **Frontend host** | Cloudflare Pages | Statis tak terbatas, komersial diizinkan | — | **Dipilih** |
|  | Vercel Hobby | Mudah | Hobby khusus non-komersial | Ditolak |
| **Akses data** | `pg` + SQL | Sederhana, mudah dipelajari | Tulis SQL manual | **Dipilih** |
|  | Prisma / Drizzle | Skema bertipe, migrasi otomatis | Lapisan tambahan untuk pemula PostgreSQL | Bisa diganti nanti |

## 3. Project Setup (langkah demi langkah)

Tahap ini dipandu perlahan karena PostgreSQL belum pernah dipakai.

1. **Repositori GitHub** `tomodachiqua-depot` dengan folder `backend/` dan `frontend/`; branch `main` (produksi) dan `dev`.
2. **Backend:** `cd backend && npm init -y`, ubah `package.json` menjadi `"type": "module"`, pasang `express pg zod bcryptjs jsonwebtoken cookie-parser cors helmet exceljs multer dotenv`, dev: `nodemon`.
3. **Entry:** buat `backend/server.mjs` (bukan `index.js`); semua file lain `.mjs`.
4. **Frontend:** `npm create vite@latest frontend -- --template react`, pasang Tailwind CSS, `react-router-dom`, `@tanstack/react-query`. File komponen memakai `.jsx` (JSX tidak bisa berekstensi `.mjs`); file konfigurasi non-JSX memakai `.mjs`.
5. **Database (panduan PostgreSQL):**
   1. Buat akun Neon dan satu project Postgres.
   2. Salin `DATABASE_URL` ke `backend/.env` (jangan di-commit).
   3. Pasang PostgreSQL lokal atau pakai branch Neon untuk pengembangan.
   4. Jalankan `node db/migrate.mjs` untuk membuat tabel dari file SQL.
   5. Buat akun ADMIN dan PEMILIK pertama lewat skrip `db/seed.mjs`.
6. **Variabel lingkungan:** `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `NODE_ENV`, `TZ=Asia/Jakarta`.
7. **Skrip pengecekan:** `npm run dev`, `npm test`, `npm run lint`.

## 4. Feature Implementation (per fitur PRD)

**F1. Auth & peran:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. Middleware `requireAuth.mjs` dan `requireRole.mjs` (`ADMIN`, `PEMILIK`). Cookie `httpOnly`, `sameSite`, `secure` di produksi; batas percobaan login (`express-rate-limit`).

**F2. Order & harga:** logika harga dipusatkan di `services/pricing.mjs` (satu sumber kebenaran, diuji unit):

- Harga satuan: pelanggan umum Rp 5.000 (tidak diantar) / Rp 6.000 (diantar); jika pelanggan punya harga custom, pakai harga itu.
- Diskon paket per pelanggan (`bundle_buy`, `bundle_pay`, contoh 10 dan 9): galon dibayar = `qty − floor(qty / buy) × (buy − pay)`.
- Total = galon dibayar × harga satuan. Harga satuan disimpan di baris order agar laporan lama tidak berubah saat harga diubah.
- Endpoint: `POST /api/orders`, `GET /api/orders`, `PATCH /api/orders/:id`.

**F3. Pelanggan & utang:** `GET/POST/PATCH /api/customers`; utang = total order − pembayaran. `GET /api/debts` (daftar pelanggan berutang), `POST /api/payments` (bayar utang, parsial diperbolehkan).

**F4. Stok toren:** input `POST /api/tank/refills` (tanggal, liter) dan `POST /api/tank/adjustments` (koreksi stok manual). Perhitungan di `services/stock.mjs`:

- Sisa liter ≈ total air masuk − total pemakaian (order + konsumsi pribadi) × liter per galon, sejak koreksi terakhir.
- Perkiraan habis: sisa ÷ rata-rata pemakaian harian (jendela 7 hari terakhir) → hari dan setara galon.
- Liter per galon disimpan di `settings` (nilai awal 19 L, **perlu dikonfirmasi** dengan galon yang dipakai).

**F5. Konsumsi pribadi:** `POST /api/personal-use` (tanggal, jumlah galon); mengurangi stok, tidak masuk pendapatan.

**F6. Laporan:** `GET /api/reports?period=daily|weekly|monthly&date=...`. Pengelompokan tanggal dilakukan di zona **Asia/Jakarta** (waktu disimpan sebagai `timestamptz`).

**F7. Keuangan:** `POST/GET /api/expenses`; ringkasan: pemasukan (pembayaran diterima) − pengeluaran.

**F8. Excel:** `GET /api/export/reports.xlsx`; `POST /api/import` (hanya ADMIN) memakai template `.xlsx` baku, validasi per baris dengan zod, hasil dry-run ditampilkan sebelum disimpan.

## 5. Design Implementation

- **Mobile-first** untuk PEMILIK: navigasi bawah (Order, Utang, Stok, Laporan), tombol minimal 44 px, input angka dengan keypad numerik.
- **ADMIN di komputer:** sidebar dan tabel lebih lebar, halaman impor/ekspor dan data master.
- Tailwind CSS dengan token warna sederhana (biru air); komponen dasar dibuat sendiri (Button, Input, Card, Table).
- Komponen pakai pola formulir tunggal untuk order agar kasir bisa menyelesaikan order dalam sedikit ketukan.
- Tampilkan pesan "Menyiapkan server…" saat respons pertama lambat (lihat Limitations).
- Aksesibilitas: kontras tinggi, teks Bahasa Indonesia, format Rupiah `Rp 5.000`.

## 6. Database & Storage

PostgreSQL (Neon). Semua uang disimpan sebagai integer rupiah.

| Tabel | Kolom utama |
| --- | --- |
| `users` | id, name, username, password\_hash, role (`ADMIN`/`PEMILIK`), created\_at |
| `customers` | id, name, phone, address, custom\_price (nullable), bundle\_buy, bundle\_pay (nullable), is\_active |
| `orders` | id, customer\_id (nullable), qty, is\_delivered, unit\_price, paid\_qty, total, paid\_amount, ordered\_at, created\_by, note |
| `payments` | id, customer\_id, order\_id (nullable), amount, paid\_at, created\_by |
| `tank_refills` | id, refill\_date, liters, note, created\_by |
| `tank_adjustments` | id, adjusted\_at, liters\_after, note |
| `personal_use` | id, used\_at, gallons, note |
| `expenses` | id, spent\_at, category, amount, note |
| `settings` | key, value (liters\_per\_gallon, harga default, dll.) |

- Indeks pada `orders(ordered_at)`, `orders(customer_id)`, `payments(customer_id)`.
- Migrasi berupa file SQL berurutan di `backend/db/migrations/` dan dijalankan oleh `migrate.mjs`.
- **Backup:** riwayat pemulihan gratis Neon hanya beberapa jam, maka ADMIN menjalankan `pg_dump` berkala dan mengekspor Excel bulanan; simpan salinannya di luar layanan.
- Tidak ada penyimpanan file pengguna (impor Excel diproses di memori).

## 7. AI Assistance Strategy

| Tugas | Alat | Catatan |
| --- | --- | --- |
| Perencanaan, PRD, desain teknis | Claude (chat) | Selesai di dokumen ini |
| Penulisan kode per fitur | Claude Code (lewat CLAUDE.md yang merujuk ke AGENTS.md) membaca `AGENTS.md` dan `agent_docs/` | Satu fitur per sesi, minta rencana dulu |
| Review dan debugging | Claude Code | Sertakan pesan error lengkap |
| Panduan PostgreSQL | Claude | Langkah demi langkah, konfirmasi tiap tahap |

Aturan kerja: rencana disetujui dulu, bangun satu fitur, uji, baru lanjut (sesuai gaya kerja bertahap).

## 8. Deployment Plan

1. **Neon:** buat database produksi, jalankan migrasi dan seed.
2. **Render:** *New Web Service* dari repo GitHub, root directory `backend`, build `npm install`, start `node server.mjs`, isi variabel lingkungan; health check `GET /api/health`.
3. **Cloudflare Pages:** hubungkan repo, root `frontend`, build `npm run build`, output `dist`; set `VITE_API_URL` ke URL Render.
4. Atur `CORS_ORIGIN` di backend ke domain Pages; cookie lintas domain membutuhkan `sameSite=none; secure` (atau domain kustom di bawah satu induk yang sama).
5. **Uji pra-peluncuran:** login kedua peran, order semua kombinasi harga, utang, stok, laporan, ekspor/impor Excel di HP Ayah.
6. **Cadangan hosting:** Supabase (database) atau Koyeb (backend) bila layanan utama berubah syarat.

## 9. Cost Breakdown

| Fase | Biaya |
| --- | --- |
| Pengembangan | Rp 0 (alat AI sesuai langganan yang sudah ada) |
| Produksi | Rp 0 (Cloudflare Pages, Render free, Neon free) |
| Opsional | Domain kustom; paket berbayar bila cold start tidak bisa diterima |

## 10. Scaling Path

Pengguna tetap 2 orang; yang bertambah adalah **data**.

- **Beberapa bulan:** batas 0,5 GB Neon masih sangat longgar untuk data teks dan angka satu depot.
- **Bertahun-tahun:** arsipkan data lama ke Excel, tambahkan indeks bila laporan melambat.
- **Butuh server selalu aktif atau backup otomatis:** naik ke paket berbayar terkecil Render dan Neon.
- **Banyak cabang/depot:** tambah tabel `depots` dan pisahkan data per depot (di luar MVP).

## 11. Limitations

- **Server gratis tidur** setelah ± 15 menit tanpa lalu lintas dan butuh sekitar satu menit untuk bangun; database Neon juga tidur setelah idle sehingga query pertama lebih lambat. Untuk kasir ini terasa pada order pertama setelah lama tidak dipakai.
- Tidak ada backup otomatis jangka panjang di tier gratis; bergantung pada ekspor manual.
- Perkiraan stok toren bergantung pada input manual dan pemakaian tercatat; perlu koreksi berkala.
- Aplikasi online-only (tidak ada mode offline pada MVP).
- Batas dan syarat tier gratis bisa berubah sewaktu-waktu.

## Project Structure

```
tomodachiqua-depot/
├── AGENTS.md
├── README.md
├── docs/
│   ├── PRD-DepotAirIsiUlang-MVP.md
│   └── TechDesign-DepotAirIsiUlang-MVP.md
├── backend/
│   ├── package.json            ("type": "module")
│   ├── server.mjs              (entry point)
│   ├── src/
│   │   ├── app.mjs
│   │   ├── config/env.mjs
│   │   ├── db/{pool.mjs, migrate.mjs, seed.mjs, migrations/*.sql}
│   │   ├── middleware/{requireAuth.mjs, requireRole.mjs, errorHandler.mjs}
│   │   ├── routes/{auth,customers,orders,payments,tank,personalUse,expenses,reports,excel}.mjs
│   │   └── services/{pricing.mjs, stock.mjs, reports.mjs, excel.mjs}
│   └── tests/*.test.mjs        (node:test)
└── frontend/
    ├── package.json
    ├── vite.config.mjs
    ├── tailwind.config.mjs
    └── src/
        ├── main.jsx, App.jsx
        ├── pages/    (Login, Dashboard, Order, Customers, Debts, Tank, Reports, Finance, ImportExport)
        ├── components/
        └── lib/{api.mjs, format.mjs}
```

## Handoff Context

- **Stage:** techdesign
- **Product:** Web App Manajemen Depot Air Isi Ulang (Tomodachiqua)
- **Chosen stack:** React + Vite + Tailwind CSS (Cloudflare Pages) • Node.js + Express, file `.mjs` (Render) • PostgreSQL (Neon) • `pg`, zod, JWT cookie, exceljs
- **AI coding tool:** Claude Code
- **Roles:** ADMIN, PEMILIK
- **Next step:** buat `AGENTS.md` dan `agent_docs/` (langkah vibe-agents), lalu bangun per tahap: (1) scaffold + auth + DB, (2) pelanggan + harga + order, (3) utang + stok + konsumsi, (4) laporan + keuangan, (5) Excel, (6) deploy + README.
