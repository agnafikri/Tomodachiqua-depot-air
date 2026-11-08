# Product Requirements (ringkasan PRD)

Sumber lengkap: `docs/PRD-DepotAirIsiUlang-MVP.md`.

## Must-have (MVP)
1. **Auth dan peran** — login, `ADMIN` dan `PEMILIK`, pembatasan akses
2. **Order isi ulang** — pelanggan, jumlah galon, antar/tidak, lunas/utang; harga otomatis (standar, custom, diskon paket)
3. **Pelanggan dan utang** — data pelanggan, harga custom, daftar yang berutang, pembayaran utang (boleh parsial)
4. **Stok toren** — air masuk (tanggal, liter), koreksi, perkiraan habis (hari dan setara galon)
5. **Konsumsi pribadi** — tercatat tanpa pembayaran
6. **Laporan** — harian, mingguan, bulanan
7. **Keuangan** — pemasukan, pengeluaran, ringkasan
8. **Excel** — ekspor laporan; impor data khusus ADMIN dengan validasi

## Tidak dibangun dulu (v2, perlu konfirmasi)
Sensor stok otomatis, notifikasi WhatsApp, multi-cabang, aplikasi mobile native.

## Definition of Done
Lihat bagian 10 PRD: semua fitur di atas berfungsi, nyaman di HP dan komputer, ter-deploy gratis, `README.md` diperbarui.
