// Kategori pengeluaran. Kode disimpan di database; label ditampilkan di layar.
// UPAH ('Gaji dan upah') diisi otomatis dari slip upah harian dan TIDAK bisa dicatat manual.
export const EXPENSE_CATEGORIES = [
  { code: 'LISTRIK', label: 'Listrik' },
  { code: 'AIR', label: 'Air (PDAM)' },
  { code: 'GALON', label: 'Galon dan segel' },
  { code: 'UPAH', label: 'Gaji dan upah' },
  { code: 'TRANSPORT', label: 'Bensin dan transport' },
  { code: 'PERAWATAN', label: 'Perawatan dan filter' },
  { code: 'LAIN', label: 'Lain-lain' },
];

// Kategori yang boleh dipilih saat mencatat pengeluaran manual.
export const MANUAL_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c.code !== 'UPAH');
export const EXPENSE_CODES = MANUAL_CATEGORIES.map((c) => c.code);

export const categoryLabel = (code) => EXPENSE_CATEGORIES.find((c) => c.code === code)?.label ?? code;
