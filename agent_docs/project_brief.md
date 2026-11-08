# Project Brief — Aturan Tetap

## Bisnis
- Usaha: Tomodachiqua (depot air isi ulang milik Ayah)
- Harga standar: Rp 5.000 tidak diantar, Rp 6.000 diantar; harga custom untuk warung dan pelanggan langganan; sebagian pelanggan dapat diskon beli 10 bayar 9
- Konsumsi pribadi: pengambilan tanpa bayar; mengurangi stok, tidak masuk pendapatan
- Stok toren diinput manual (tanggal, liter air masuk); sistem memperkirakan berapa hari/galon lagi habis dari order yang masuk
- Pelanggan bisa berutang; sistem harus menampilkan daftar siapa saja yang berutang
- Liter per galon: nilai awal 19 L di `settings` (perlu dikonfirmasi Agna)

## Pengguna
- `PEMILIK`: Ayah, memakai HP, fokus input order dan melihat laporan
- `ADMIN`: Agna, memakai komputer, maintenance, impor/ekspor, data master

## Aturan Teknis Tetap
- File backend `.mjs`, entry `server.mjs`; `backend/` dan `frontend/` terpisah
- Database PostgreSQL; hosting gratis dan boleh komersial
- Ekspor dan impor Excel tersedia (impor khusus ADMIN)
- `README.md` diperbarui saat aplikasi selesai: cara maintenance, menambah kode/fitur baru, optimalisasi

## Gaya Kerja
- Bertahap dan berbasis konfirmasi; rencana disetujui dulu sebelum menulis kode
- Bantu Agna memahami PostgreSQL langkah demi langkah
