# Testing Strategy

## Alat
- Backend: `node:test` (bawaan Node), file `backend/tests/*.test.mjs`
- Frontend: lint dan build harus lolos; tes komponen opsional
- Uji manual di HP (layar sempit) dan komputer

## Prioritas Tes (wajib)
1. `pricing.mjs`: harga standar, harga custom, diskon paket (mis. 10 bayar 9, 20 bayar 18, 9 galon tanpa diskon), antar vs tidak
2. Utang: total order dikurangi pembayaran, pembayaran parsial, pelunasan
3. `stock.mjs`: sisa dan perkiraan habis, termasuk koreksi dan konsumsi pribadi
4. Laporan: batas hari di zona Asia/Jakarta (order dekat tengah malam)
5. Otorisasi: PEMILIK tidak bisa mengakses endpoint khusus ADMIN
6. Impor Excel: baris tidak valid ditolak, dry-run tidak menyimpan data

## Verification Loop
1. Tulis atau perbarui tes → 2. Implementasi → 3. `npm test` dan `npm run lint` → 4. Perbaiki sebelum lanjut → 5. Uji manual alur utama → 6. Perbarui `AGENTS.md`

## Pra-commit
Jalankan tes backend, lint, dan build frontend. Pastikan `.env` tidak ikut ter-commit.

## Uji Pra-peluncuran (di HP Ayah)
Login kedua peran • order semua kombinasi harga • utang dan pelunasan • input stok toren • laporan • ekspor dan impor Excel • perilaku saat server baru bangun
