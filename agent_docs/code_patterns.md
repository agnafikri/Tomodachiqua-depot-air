# Code Patterns

## Umum
- ES Modules; impor dengan ekstensi eksplisit (`import x from './x.mjs'`)
- Nama file backend: camelCase `.mjs`; komponen React: PascalCase `.jsx`
- Teks antarmuka dalam Bahasa Indonesia; format uang `Rp 5.000` lewat `frontend/src/lib/format.mjs`

## Backend
- Lapisan: `routes/` (HTTP + validasi zod) → `services/` (logika bisnis) → `db/` (SQL via `pg`)
- Route tipis; logika harga hanya di `services/pricing.mjs`, stok di `services/stock.mjs`
- Query SQL selalu berparameter (`$1, $2`), tidak pernah menyambung string
- Error ditangani `middleware/errorHandler.mjs`; respons seragam `{ error: { code, message } }`
- Otorisasi: `requireAuth.mjs` lalu `requireRole.mjs('ADMIN')` untuk impor Excel dan data master
- Uang = integer rupiah; waktu = `timestamptz`; pengelompokan harian memakai `AT TIME ZONE 'Asia/Jakarta'`

## Rumus harga (referensi untuk `pricing.mjs`)
- Harga satuan: custom per pelanggan jika ada; selain itu Rp 5.000 (tidak diantar) atau Rp 6.000 (diantar)
- Diskon paket per pelanggan (`bundle_buy`, `bundle_pay`): galon dibayar = `qty − floor(qty / buy) × (buy − pay)`
- Total = galon dibayar × harga satuan; harga satuan disimpan pada baris order

## Frontend
- Mobile-first; navigasi bawah untuk PEMILIK (Order, Utang, Stok, Laporan); sidebar untuk ADMIN
- Data server lewat TanStack Query; state lokal seperlunya
- Komponen dasar buatan sendiri (Button, Input, Card, Table); target sentuh minimal 44 px
- Tampilkan state loading dan pesan "Menyiapkan server…" saat respons pertama lambat
