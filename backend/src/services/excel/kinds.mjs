// Definisi tiga jenis impor (kolom template). Dipakai pembuat template dan pembaca berkas.
import { MANUAL_CATEGORIES } from '../expenseCategories.mjs';

export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const KINDS = {
  CUSTOMERS: {
    slug: 'pelanggan',
    label: 'Pelanggan',
    sheet: 'Pelanggan',
    columns: [
      { key: 'name', header: 'Nama', required: true, width: 28 },
      { key: 'phone', header: 'Telepon', width: 18 },
      { key: 'address', header: 'Alamat', width: 30 },
      { key: 'customPrice', header: 'Harga khusus', width: 16 },
      { key: 'bundleBuy', header: 'Paket beli', width: 12 },
      { key: 'bundlePay', header: 'Paket bayar', width: 13 },
      { key: 'active', header: 'Aktif', width: 10 },
    ],
  },
  ORDERS: {
    slug: 'order',
    label: 'Order lama',
    sheet: 'Order',
    columns: [
      { key: 'date', header: 'Tanggal', required: true, width: 14 },
      { key: 'time', header: 'Jam', width: 9 },
      { key: 'customer', header: 'Pelanggan', width: 28 },
      { key: 'qty', header: 'Jumlah galon', required: true, width: 15 },
      { key: 'delivered', header: 'Diantar', required: true, width: 10 },
      { key: 'status', header: 'Status', required: true, width: 10 },
      { key: 'paid', header: 'Dibayar', width: 12 },
      { key: 'note', header: 'Catatan', width: 32 },
    ],
  },
  EXPENSES: {
    slug: 'pengeluaran',
    label: 'Pengeluaran',
    sheet: 'Pengeluaran',
    columns: [
      { key: 'date', header: 'Tanggal', required: true, width: 14 },
      { key: 'category', header: 'Kategori', required: true, width: 24 },
      { key: 'amount', header: 'Jumlah', required: true, width: 14 },
      { key: 'note', header: 'Catatan', width: 34 },
    ],
  },
};

export const KIND_BY_SLUG = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v.slug, k]));
export const CATEGORY_LABELS = MANUAL_CATEGORIES.map((c) => c.label);
