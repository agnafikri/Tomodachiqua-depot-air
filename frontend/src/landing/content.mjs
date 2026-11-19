// ISI LANDING PAGE. Ubah teks di sini; halaman dibuat ulang otomatis saat `npm run dev` / `npm run build`.
// Bagian yang masih kosong ([] atau '') tidak ditampilkan. Jangan menulis klaim yang belum bisa dibuktikan
// (testimoni, jumlah pelanggan, sertifikasi, garansi) kecuali memang benar.
export const content = {
  brand: 'Tomodachiqua',

  // Diisi saat deploy, mis. 'https://tomodachiqua.id'. Bisa juga lewat variabel lingkungan VITE_SITE_URL.
  siteUrl: '',
  // Nomor WhatsApp, mis. '08xx xxxx xxxx'. Kosong = tombol WhatsApp tidak ditampilkan.
  whatsapp: '',
  email: '',
  address: '',
  hours: '', // mis. 'Senin sampai Sabtu, 08.00 - 17.00'

  title: 'Pasang dan Service Depot Air Isi Ulang Bandung Cimahi | Tomodachiqua',
  description:
    'Tomodachiqua melayani pemasangan depot air isi ulang baru dan service peralatan depot di Kota Bandung dan Cimahi. Hubungi kami untuk survei dan penawaran.',

  hero: {
    headline: 'Pasang dan service depot air isi ulang di Bandung dan Cimahi',
    subtitle:
      'Ingin membuka depot air isi ulang, atau merawat depot yang sudah berjalan? Ceritakan kebutuhan Anda, kami hubungi kembali.',
  },

  areas: ['Kota Bandung', 'Cimahi'],
  districts: [], // daftar kecamatan yang dilayani, mis. ['Coblong', 'Cicendo']

  about: '', // paragraf tentang usaha; kosong = bagian tidak tampil

  services: [
    { title: 'Pemasangan depot baru', text: 'Survei lokasi, rekomendasi peralatan sesuai kebutuhan, dan pemasangan instalasi depot air isi ulang.' },
    { title: 'Service berkala', text: 'Perawatan rutin peralatan depot, seperti pengecekan filter, lampu UV, pompa, dan kebersihan tandon.' },
    { title: 'Perbaikan', text: 'Pengecekan dan perbaikan peralatan depot yang bermasalah, misalnya kebocoran atau pompa yang tidak bekerja.' },
    { title: 'Konsultasi dan survei', text: 'Belum tahu mulai dari mana? Konsultasikan rencana depot Anda, lengkap dengan kebutuhan lokasi dan peralatan.' },
  ],

  steps: [
    { title: 'Hubungi kami', text: 'Lewat WhatsApp atau formulir di halaman ini.' },
    { title: 'Kami menghubungi balik', text: 'Kami mendengarkan kebutuhan Anda dan menjadwalkan survei bila perlu.' },
    { title: 'Penawaran', text: 'Pekerjaan dan biayanya kami jelaskan sebelum dikerjakan.' },
    { title: 'Pengerjaan', text: 'Pemasangan atau service dikerjakan sesuai kesepakatan.' },
  ],

  // Kosongkan jika belum ada. Isi hanya dengan data nyata.
  packages: [], // [{ title, price, text }]
  gallery: [], // [{ src, alt }]
  testimonials: [], // [{ name, text }]

  faq: [
    { q: 'Area mana saja yang dilayani?', a: 'Saat ini Kota Bandung dan Cimahi. Untuk daerah lain, silakan tanyakan lewat formulir; kami kabari apakah bisa dijangkau.' },
    { q: 'Berapa biaya pemasangan atau service?', a: 'Biaya bergantung pada kebutuhan dan kondisi lokasi. Hubungi kami untuk mendapatkan penawaran.' },
    { q: 'Apakah harus survei dulu?', a: 'Untuk pemasangan baru, biasanya perlu survei lokasi agar rekomendasinya tepat. Untuk service, kami tanyakan dulu keluhannya.' },
    { q: 'Apa yang terjadi setelah saya mengisi formulir?', a: 'Tim kami menghubungi nomor WhatsApp yang Anda isi untuk membahas kebutuhan Anda.' },
  ],
};
