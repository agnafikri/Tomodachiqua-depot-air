// Template impor: lembar data (hanya judul kolom + pilihan dropdown) dan lembar Petunjuk (aturan + contoh).
import ExcelJS from 'exceljs';
import { CATEGORY_LABELS, KINDS } from './kinds.mjs';

const BLUE = 'FF0B5FA5';
const GREY = 'FF55697A';
const ROWS_WITH_VALIDATION = 1000;

const HELP = {
  CUSTOMERS: {
    lines: [
      'Isi satu pelanggan per baris, mulai dari baris 2 di lembar "Pelanggan". Jangan ubah judul kolom di baris 1.',
      'Kolom bertanda biru tua wajib diisi; kolom abu-abu boleh kosong.',
      'Harga khusus = harga final per galon, berlaku sama untuk diantar maupun diambil. Kosongkan untuk harga standar.',
      'Diskon paket: isi Paket beli dan Paket bayar bersamaan (mis. beli 10 bayar 9), atau kosongkan keduanya. Paket bayar harus lebih kecil dari Paket beli.',
      'Aktif: Ya atau Tidak (kosong = Ya).',
      'Nama pelanggan tidak boleh sama dengan pelanggan yang sudah ada atau dengan baris lain di berkas ini.',
    ],
    example: [['Nama', 'Telepon', 'Alamat', 'Harga khusus', 'Paket beli', 'Paket bayar', 'Aktif'], ['Warung Bu Ani', '0812 3456 7890', 'Pasar Baru', 4500, 10, 9, 'Ya'], ['Pak Budi', '', '', '', '', '', 'Ya']],
  },
  ORDERS: {
    lines: [
      'Isi satu order per baris, mulai dari baris 2 di lembar "Order". Jangan ubah judul kolom di baris 1.',
      'Impor template Pelanggan lebih dulu: nama di kolom Pelanggan harus sama dengan nama pelanggan di aplikasi. Kosongkan untuk pelanggan umum.',
      'Tanggal: 2026-11-08 atau 08/11/2026 (tidak boleh di masa depan). Jam boleh kosong (dianggap 12:00).',
      'Harga TIDAK diisi: dihitung otomatis dengan aturan harga aplikasi (standar, harga khusus pelanggan, dan diskon paket pelanggan saat ini).',
      'Status: Lunas atau Utang. Untuk Lunas, kolom Dibayar dikosongkan.',
      'Untuk Utang yang sudah dibayar sebagian, isi Dibayar dengan jumlah yang sudah masuk (harus kurang dari total).',
      'Utang pelanggan umum wajib diberi Catatan (siapa yang berutang).',
      'Order yang bertanggal setelah koreksi stok toren terakhir akan mengurangi hitungan stok.',
    ],
    example: [['Tanggal', 'Jam', 'Pelanggan', 'Jumlah galon', 'Diantar', 'Status', 'Dibayar', 'Catatan'], ['2026-11-02', '09:30', 'Warung Bu Ani', 20, 'Ya', 'Utang', 40000, ''], ['2026-11-03', '', '', 3, 'Tidak', 'Lunas', '', ''], ['2026-11-03', '', '', 1, 'Ya', 'Utang', '', 'Pak Dedi RT 3']],
  },
  EXPENSES: {
    lines: [
      'Isi satu pengeluaran per baris, mulai dari baris 2 di lembar "Pengeluaran". Jangan ubah judul kolom di baris 1.',
      `Kategori harus salah satu dari: ${CATEGORY_LABELS.join(', ')}.`,
      'Upah karyawan tidak diimpor di sini; upah dicatat lewat menu Upah.',
      'Tanggal: 2026-11-08 atau 08/11/2026 (tidak boleh di masa depan). Jumlah dalam rupiah, angka bulat.',
    ],
    example: [['Tanggal', 'Kategori', 'Jumlah', 'Catatan'], ['2026-11-02', 'Listrik', 150000, 'token listrik'], ['2026-11-04', 'Bensin dan transport', 35000, '']],
  },
};

export async function buildTemplate(kind) {
  const def = KINDS[kind];
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tomodachiqua Depot';

  const ws = wb.addWorksheet(def.sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = def.columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).height = 22;
  def.columns.forEach((c, i) => {
    const cellRef = ws.getRow(1).getCell(i + 1);
    cellRef.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cellRef.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? BLUE : GREY } };
    cellRef.alignment = { vertical: 'middle' };
  });

  const colIndex = (key) => def.columns.findIndex((c) => c.key === key) + 1;
  const validate = (key, formula) => {
    const idx = colIndex(key);
    if (!idx) return;
    for (let r = 2; r <= ROWS_WITH_VALIDATION; r += 1) {
      ws.getCell(r, idx).dataValidation = { type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: true, errorTitle: 'Pilihan tidak valid', error: 'Pilih dari daftar.' };
    }
  };
  const format = (key, numFmt) => {
    const idx = colIndex(key);
    if (idx) ws.getColumn(idx).numFmt = numFmt;
  };

  if (kind === 'CUSTOMERS') {
    validate('active', '"Ya,Tidak"');
    format('customPrice', '#,##0');
  }
  if (kind === 'ORDERS') {
    validate('delivered', '"Ya,Tidak"');
    validate('status', '"Lunas,Utang"');
    format('date', 'yyyy-mm-dd');
    format('paid', '#,##0');
  }
  if (kind === 'EXPENSES') {
    validate('category', `"${CATEGORY_LABELS.join(',')}"`);
    format('date', 'yyyy-mm-dd');
    format('amount', '#,##0');
  }

  const help = wb.addWorksheet('Petunjuk');
  help.getColumn(1).width = 110;
  help.addRow([`Template impor: ${def.label}`]).font = { bold: true, size: 14 };
  help.addRow(['']);
  for (const line of HELP[kind].lines) help.addRow([`• ${line}`]).alignment = { wrapText: true, vertical: 'top' };
  help.addRow(['']);
  help.addRow(['Contoh pengisian (jangan disalin bersama judul ke lembar data; isi langsung di lembar data):']).font = { bold: true };
  const ex = HELP[kind].example;
  const startCol = 1;
  for (const r of ex) {
    const row = help.addRow([r.join('  |  ')]);
    if (r === ex[0]) row.font = { bold: true };
  }
  help.getColumn(startCol).alignment = { wrapText: true };
  return wb;
}
