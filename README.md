# Tomodachiqua Depot

Web app manajemen Depot Air Isi Ulang Tomodachiqua: order, utang, stok toren, laporan, keuangan, dan ekspor/impor Excel.

> README ini sementara (akhir Fase 1). Versi lengkap (maintenance, menambah fitur, optimalisasi) ditulis di Fase 6.

## Struktur

```
backend/    Node.js + Express (semua file .mjs), PostgreSQL
frontend/   React + Vite + Tailwind CSS v4 (komponen .jsx)
docs/       PRD dan Technical Design
agent_docs/ Panduan stack, pola kode, dan pengujian
AGENTS.md   Rencana induk dan status pengerjaan
```

## Menjalankan di komputer sendiri

Butuh Node.js 22 atau lebih baru dan database PostgreSQL (Neon).

**Backend**

```bash
cd backend
npm install
cp .env.example .env     # lalu isi DATABASE_URL, JWT_SECRET, dan akun SEED_*
npm run migrate          # membuat/memperbarui tabel (aman diulang)
npm run seed             # membuat akun ADMIN dan PEMILIK
npm run dev              # http://localhost:4000
npm test                 # menguji login dan pembatasan peran
```

**Frontend** (terminal lain)

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
npm test                 # menguji alur login/logout di React
```

Saat dev, Vite meneruskan `/api` ke backend di port 4000, jadi `VITE_API_URL` dibiarkan kosong.

## Akun

`npm run seed` membuat atau memperbarui akun dari `backend/.env`. Untuk mengganti password, ubah `SEED_*_PASSWORD` lalu jalankan `npm run seed` lagi. Ganti password awal sebelum dipakai di produksi.

## Catatan penting

- Jangan commit `.env`. Hanya `.env.example` yang masuk repo.
- Tes memakai database dari `DATABASE_URL`. Tes hanya membuat dan menghapus akun dengan username berawalan `tes_`, tetapi sebaiknya jalankan di database pengembangan, bukan produksi.

## Ekspor dan impor Excel

- **Unduh laporan:** tombol *Unduh Excel* di Laporan dan Keuangan (ADMIN dan PEMILIK).
- **Cadangan lengkap, template, dan impor:** menu *Impor dan ekspor* (khusus ADMIN). Impor selalu diperiksa dulu (tidak ada yang tersimpan), lalu disimpan semua-atau-tidak-sama-sekali. Impor bisa dibatalkan dari riwayat impor.
- Setelah memasang Fase 5, jalankan `npm install` di `backend/` (ada dependensi baru) lalu `npm run migrate`.
