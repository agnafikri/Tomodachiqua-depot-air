# PRD — Web App Manajemen Depot Air Isi Ulang (MVP)

*Mengikuti struktur 10 bagian dari template KhazP/vibe-coding-prompt-template (skill vibe-prd). Simpan sebagai `docs/PRD-DepotAirIsiUlang-MVP.md`. Langkah berikutnya di alur template: Tech Design (`docs/TechDesign-DepotAirIsiUlang-MVP.md`), lalu `AGENTS.md`.*

## 1. Product Overview

- **Nama produk:** Web App Manajemen Depot Air Isi Ulang
- **Tagline:** Catat order, utang, stok toren, dan keuangan depot dari HP, tanpa buku tulis.
- **Tujuan:** Menggantikan pencatatan manual usaha Tomodachiqua (depot air isi ulang milik Ayah) dengan satu aplikasi web yang mudah dipakai pemilik di HP dan dikelola admin di komputer.
- **Target launch:** *(tanggal mulai dipakai di Tomodachiqua; diisi Agna bersama Ayah)*
- **Level teknis pembuat:** Developer/in-between (Node.js, React, Tailwind CSS, GitHub)

## 2. Target Users

| Peran | Siapa | Perangkat | Kebutuhan utama |
| --- | --- | --- | --- |
| **PEMILIK** | Ayah (pemilik/kasir depot) | HP | Input order cepat, lihat laporan, cek utang pelanggan, pantau stok toren |
| **ADMIN** | Agna (maintenance) | Komputer | Kelola data master, perbaiki data, ekspor/impor Excel, maintenance sistem |

**Pain points:** pencatatan manual rawan salah, sulit melacak siapa yang berutang, harga berbeda per pelanggan, stok toren hanya diperkirakan, laporan harian/bulanan dihitung manual.

## 3. Problem Statement

Depot air isi ulang memiliki aturan harga yang beragam (antar/tidak antar, harga custom, diskon per jumlah galon), pelanggan berutang, dan stok air di toren yang harus dipantau. Tanpa sistem, pemilik kesulitan melihat omzet, utang, dan kapan air di toren akan habis.

## 4. User Journey

1. Pemilik membuka web app di HP dan login.
2. Pelanggan datang atau memesan: pemilik memilih pelanggan (atau umum), jumlah galon, antar/tidak; sistem menghitung harga otomatis.
3. Pemilik menandai lunas atau berutang; jika berutang, tercatat di daftar utang pelanggan.
4. Saat air masuk ke toren, pemilik mencatat tanggal dan liter; sistem menampilkan perkiraan berapa hari lagi toren habis.
5. Akhir hari/minggu/bulan, pemilik membuka laporan dan keuangan; admin dapat mengekspor ke Excel.

## 5. MVP Features

### Aturan harga

- Tidak diantar: **Rp 5.000**/galon
- Diantar: **Rp 6.000**/galon
- **Harga custom** per pelanggan (warung dan pelanggan langganan)
- **Diskon paket** untuk pelanggan tertentu (contoh: beli 10 galon bayar 9)

### Must-have

**F1. Autentikasi & peran**

- Dua peran: `ADMIN` dan `PEMILIK`.
- *Sebagai pemilik, saya ingin login sederhana di HP agar bisa langsung input order.*
- Kriteria: halaman yang hanya untuk admin tidak dapat diakses pemilik; sesi aman.

**F2. Transaksi order isi ulang**

- Input pelanggan, jumlah galon, antar/tidak, status bayar (lunas/utang).
- Harga dihitung otomatis dari aturan standar, harga custom, dan diskon paket.
- Kriteria: total benar untuk semua kombinasi aturan harga; bisa dipakai nyaman di layar HP.

**F3. Manajemen pelanggan & utang**

- Data pelanggan, harga custom, dan aturan diskon per pelanggan.
- Daftar siapa saja yang berutang beserta total utang; pencatatan pembayaran utang.
- Kriteria: daftar utang selalu sesuai transaksi dan pembayaran.

**F4. Stok air toren**

- Input manual: tanggal, liter air yang masuk.
- Sistem menghitung **perkiraan berapa hari/galon lagi toren habis** berdasarkan order yang masuk.
- Kriteria: perkiraan diperbarui otomatis setiap ada order atau konsumsi baru.

**F5. Konsumsi pribadi**

- Pencatatan pengambilan air untuk pemakaian pribadi tanpa pembayaran; mengurangi stok tetapi tidak masuk pendapatan.

**F6. Laporan harian, mingguan, bulanan**

- Ringkasan jumlah galon, pendapatan, utang baru, pelunasan.

**F7. Manajemen keuangan**

- Pemasukan dari order; pencatatan pengeluaran usaha; ringkasan saldo per periode.

**F8. Ekspor & impor Excel**

- Ekspor laporan ke Excel; impor data (format template yang ditentukan) dengan validasi.
- Fitur impor dan pengelolaan data master dibatasi untuk ADMIN.

### Won't have (v1) / ide v2

- Pencatatan stok toren otomatis lewat sensor; notifikasi WhatsApp ke pelanggan; multi-cabang; aplikasi mobile native. *(Konfirmasi dengan Agna.)*

## 6. Success Metrics

*(Usulan, sesuaikan dengan Agna dan Ayah.)*

- Pemilik dapat menginput satu order dalam waktu singkat dari HP tanpa bantuan.
- Seluruh order dan utang tercatat di aplikasi selama 1 bulan penuh menggantikan pencatatan manual.
- Laporan bulanan cocok dengan perhitungan manual pemilik.

## 7. Design Direction

- Mobile-first untuk PEMILIK (tombol besar, input cepat); layout lebih lega untuk ADMIN di komputer.
- Gaya: bersih, sederhana, mudah dibaca, memakai Tailwind CSS.
- Layar kunci: Login, Dashboard ringkas, Input Order, Daftar Pelanggan & Utang, Stok Toren, Laporan, Keuangan, Impor/Ekspor (admin).

## 8. Technical Considerations

- **Stack:** Node.js (backend), React (frontend), Tailwind CSS, GitHub.
- **Database:** PostgreSQL (belum pernah dipakai Agna; tahap setup harus dipandu langkah demi langkah).
- **Struktur proyek:** folder terpisah `backend/` dan `frontend/`.
- **Konvensi kode:** semua file JavaScript memakai ekstensi `.mjs` (`"type": "module"`, ECMAScript); entry backend bernama `server.mjs` (bukan `index.js`).
- **Hosting/deploy:** harus gratis dan boleh dipakai untuk komersial (pilihan penyedia ditentukan di Tech Design; periksa syarat layanan terbaru).
- **Keamanan:** hash password, otorisasi berbasis peran (`ADMIN`/`PEMILIK`), validasi input, backup data berkala.
- **Performa/kompatibilitas:** cepat di HP dengan koneksi biasa; browser modern.

## 9. Constraints

- **Budget:** nol/gratis (hosting dan database harus gratis dan legal untuk komersial).
- **Timeline:** *(isi oleh Agna)*
- **Scope:** hanya satu depot, dua pengguna, fokus pada fitur must-have di atas.
- **Dokumentasi:** `README.md` diperbarui setelah web app selesai (cara maintenance, menambah kode/fitur baru, optimalisasi).

## 10. Definition of Done

- [ ] Login berfungsi dengan dua peran (ADMIN, PEMILIK) dan pembatasan akses sesuai peran
- [ ] Order isi ulang tercatat dengan harga otomatis (standar, custom, diskon paket)
- [ ] Daftar pelanggan berutang akurat, termasuk pembayaran utang
- [ ] Stok toren dapat diinput dan perkiraan habis tampil
- [ ] Konsumsi pribadi tercatat tanpa masuk pendapatan
- [ ] Laporan harian, mingguan, dan bulanan benar
- [ ] Keuangan (pemasukan/pengeluaran) berfungsi
- [ ] Ekspor dan impor Excel berfungsi
- [ ] Nyaman dipakai di HP (pemilik) dan komputer (admin)
- [ ] Ter-deploy di hosting gratis yang boleh komersial dan sudah dipakai Ayah
- [ ] README.md diperbarui

## Self-Verification (dari template)

- Masalah inti jelas? ✔
- Target pengguna terdeskripsi? ✔
- 3–5 fitur inti? (ada 8 fitur must-have; pertimbangkan memangkas ke tahap bertahap saat build)
- Metrik keberhasilan terdefinisi? ✔ (usulan, perlu konfirmasi)
