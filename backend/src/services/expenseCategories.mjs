// Kategori pengeluaran. Kode disimpan di database; label ditampilkan di layar.
export const EXPENSE_CATEGORIES = [
  { code: 'LISTRIK', label: 'Listrik' },
  { code: 'AIR', label: 'Air (PDAM)' },
  { code: 'GALON', label: 'Galon dan segel' },
  { code: 'UPAH', label: 'Gaji dan upah' },
  { code: 'TRANSPORT', label: 'Bensin dan transport' },
  { code: 'PERAWATAN', label: 'Perawatan dan filter' },
  { code: 'LAIN', label: 'Lain-lain' },
];

export const EXPENSE_CODES = EXPENSE_CATEGORIES.map((c) => c.code);

export const categoryLabel = (code) => EXPENSE_CATEGORIES.find((c) => c.code === code)?.label ?? code;
