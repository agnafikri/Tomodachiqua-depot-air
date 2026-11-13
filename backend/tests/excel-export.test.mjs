// Tes ekspor Excel: isi berkas dibaca kembali dan dicocokkan dengan angka Laporan (jam palsu tahun 2031).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { at, createHarness } from './helpers.mjs';
import { read, table } from './xlsx.mjs';

let h;
const XLSX_TYPE = 'spreadsheetml.sheet';
const post = (path, body, cookie = h.pemilik) => h.api(path, { method: 'POST', cookie, body });
const get = (path, cookie = h.pemilik) => h.api(path, { cookie });

before(async () => {
  h = await createHarness('xpt');
});
after(async () => {
  await h.close();
});

async function order(body) {
  const r = await post('/api/orders', { isDelivered: true, payStatus: 'PAID', ...body });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.order;
}

describe('akses dan validasi', () => {
  it('laporan: wajib login; PEMILIK boleh; parameter tidak valid ditolak', async () => {
    at('2031-08-10T09:00');
    assert.equal((await h.download('/api/export/report.xlsx?period=monthly')).status, 401);
    const ok = await h.download('/api/export/report.xlsx?period=monthly', h.pemilik);
    assert.equal(ok.status, 200);
    assert.ok(ok.headers.get('content-type').includes(XLSX_TYPE));
    for (const q of ['period=tahunan', 'date=2031-08-11', 'date=2031-02-30']) {
      assert.equal((await h.download(`/api/export/report.xlsx?${q}`, h.pemilik)).status, 400, q);
    }
  });

  it('cadangan lengkap: khusus ADMIN', async () => {
    assert.equal((await h.download('/api/export/backup.xlsx')).status, 401);
    assert.equal((await h.download('/api/export/backup.xlsx', h.pemilik)).status, 403);
    assert.equal((await h.download('/api/export/backup.xlsx', h.admin)).status, 200);
  });

  it('nama berkas sesuai periode', async () => {
    at('2031-08-10T09:00');
    const name = async (q) => (await h.download(`/api/export/report.xlsx?${q}`, h.pemilik)).headers.get('content-disposition');
    assert.match(await name('period=daily&date=2031-08-02'), /laporan-harian-2031-08-02\.xlsx/);
    assert.match(await name('period=weekly&date=2031-08-02'), /laporan-mingguan-2031-07-28_2031-08-03\.xlsx/);
    assert.match(await name('period=monthly&date=2031-08-02'), /laporan-bulanan-2031-08\.xlsx/);
  });
});

describe('isi laporan Excel sama dengan layar Laporan', () => {
  let report;
  let finance;
  let wb;

  it('menyiapkan data: order, utang, keringanan, pengeluaran, upah, dan data batal', async () => {
    at('2031-08-01T08:00');
    const c = await h.newCustomer('Warung', { customPrice: 4500 });
    at('2031-08-02T09:00');
    await order({ customerId: c.id, qty: 10 }); // lunas 45.000
    await order({ customerId: null, qty: 2, isDelivered: false }); // lunas 10.000
    const utangC = await order({ customerId: c.id, qty: 4, payStatus: 'DEBT' }); // utang 18.000
    const umum = await order({ customerId: null, qty: 1, payStatus: 'DEBT', note: 'Bu Siti' }); // utang 6.000
    assert.equal((await post('/api/payments', { orderId: utangC.id, amount: 10000 })).status, 201);
    assert.equal((await post('/api/payments', { orderId: umum.id, amount: 5000, waiveRemaining: true, note: 'dimaafkan' })).status, 201);
    assert.equal((await post('/api/expenses', { category: 'LISTRIK', amount: 50000, note: 'token' })).status, 201);
    assert.equal((await post('/api/personal-use', { gallons: 3 })).status, 201);
    const emp = (await post('/api/employees', { name: 'ZZTEST xpt Budi' })).json.employee;
    assert.equal((await post('/api/wages', { wageDate: '2031-08-02', items: [{ employeeId: emp.id, amount: 30000, note: 'ramai' }] })).status, 201);
    const salah = await order({ customerId: null, qty: 3 }); // dibatalkan: tidak boleh muncul di laporan periode
    await h.api(`/api/orders/${salah.id}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } });

    at('2031-08-10T09:00');
    report = (await get('/api/reports?period=monthly&date=2031-08-10')).json;
    finance = (await get('/api/finance?period=monthly&date=2031-08-10')).json;
    const dl = await h.download('/api/export/report.xlsx?period=monthly&date=2031-08-10', h.pemilik);
    wb = await read(dl.buffer);
  });

  it('lembar-lembar yang diharapkan ada', () => {
    assert.deepEqual(wb.worksheets.map((s) => s.name), ['Ringkasan', 'Order', 'Pembayaran', 'Keringanan', 'Pengeluaran', 'Upah', 'Utang saat ini']);
  });

  it('Ringkasan: angka sama dengan /api/reports', () => {
    const ws = wb.getWorksheet('Ringkasan');
    const byLabel = {};
    ws.eachRow((row) => {
      const [label, value] = [row.getCell(1).value, row.getCell(2).value];
      if (typeof label === 'string' && typeof value === 'number') byLabel[label.trim()] = value;
    });
    const t = report.totals;
    assert.equal(byLabel['Uang masuk'], t.cashIn);
    assert.equal(byLabel['Dibayar saat order'], t.cashInAtOrder);
    assert.equal(byLabel['Pembayaran utang (pelunasan)'], t.debtPayments);
    assert.equal(byLabel['Pengeluaran (termasuk upah)'], t.expenses);
    assert.equal(byLabel['Termasuk upah harian'], t.wages);
    assert.equal(byLabel['Saldo (uang masuk - pengeluaran)'], t.balance);
    assert.equal(byLabel['Nilai penjualan (termasuk yang masih utang)'], t.sales);
    assert.equal(byLabel['Jumlah order'], t.orderCount);
    assert.equal(byLabel['Galon terjual'], t.gallons);
    assert.equal(byLabel['Konsumsi pribadi (galon)'], t.personalGallons);
    assert.equal(byLabel['Utang baru'], t.newDebt);
    assert.equal(byLabel['Keringanan (dianggap lunas, bukan uang masuk)'], t.waived);
    // nilai yang kita siapkan sendiri
    assert.equal(t.cashIn, 45000 + 10000 + 10000 + 5000);
    assert.equal(t.expenses, 50000 + 30000);
  });

  it('Ringkasan: rincian per hari dengan tanggal sungguhan dan total berumus', () => {
    const ws = wb.getWorksheet('Ringkasan');
    let headerRow = null;
    ws.eachRow((row, n) => { if (row.getCell(1).value === 'Tanggal' && row.getCell(2).value === 'Jumlah order') headerRow = n; });
    assert.ok(headerRow, 'tabel rincian per hari ada');
    const first = ws.getRow(headerRow + 1);
    assert.ok(first.getCell(1).value instanceof Date, 'tanggal berupa tanggal Excel');
    assert.equal(first.getCell(1).value.toISOString().slice(0, 10), '2031-08-01');
    const totalRow = ws.getRow(headerRow + 1 + report.days.length);
    assert.equal(totalRow.getCell(1).value, 'Total');
    assert.match(totalRow.getCell(4).value.formula, /^SUM\(D\d+:D\d+\)$/);
    assert.equal(totalRow.getCell(4).value.result, report.totals.sales);
    assert.equal(totalRow.getCell(5).value.result, report.totals.cashIn);
  });

  it('Order: satu baris per order (yang batal tidak ada), angka numerik, total berumus', () => {
    const ws = wb.getWorksheet('Order');
    const rows = table(ws);
    assert.equal(rows.length, 4);
    assert.ok(rows.every((r) => r.Tanggal instanceof Date && r.Tanggal.toISOString().slice(0, 10) === '2031-08-02'));
    assert.ok(rows.every((r) => typeof r.Total === 'number' && typeof r['Harga satuan'] === 'number' && typeof r.Dibayar === 'number'));
    const byTotal = (n) => rows.find((r) => r.Total === n);
    assert.equal(byTotal(45000)['Harga satuan'], 4500);
    assert.equal(byTotal(45000).Status, 'Lunas');
    assert.equal(byTotal(10000).Pelanggan, 'Umum');
    assert.equal(byTotal(10000).Pengantaran, 'Diambil');
    assert.equal(byTotal(18000).Status, 'Sebagian');
    assert.equal(byTotal(18000)['Sisa utang'], 8000);
    const umum = byTotal(6000);
    assert.equal(umum.Status, 'Lunas');
    assert.equal(umum.Dibayar, 5000);
    assert.equal(umum.Keringanan, 1000);
    assert.equal(umum['Sisa utang'], 0);
    assert.equal(umum.Catatan, 'Bu Siti');

    const all = table(ws, { withTotal: true });
    const totalRow = all.at(-1);
    assert.equal(totalRow.Tanggal, 'Total');
    assert.match(totalRow.Total.formula, /^SUM\(/);
    assert.equal(totalRow.Total.result, report.totals.sales);
    assert.equal(totalRow['Sisa utang'].result, 8000);
  });

  it('Pembayaran: jumlahnya sama dengan uang masuk; jenisnya terpisah', () => {
    const rows = table(wb.getWorksheet('Pembayaran'));
    assert.equal(rows.reduce((s, r) => s + r.Jumlah, 0), report.totals.cashIn);
    assert.equal(rows.filter((r) => r.Jenis === 'Saat order').reduce((s, r) => s + r.Jumlah, 0), report.totals.cashInAtOrder);
    assert.equal(rows.filter((r) => r.Jenis === 'Pelunasan utang').reduce((s, r) => s + r.Jumlah, 0), report.totals.debtPayments);
  });

  it('Keringanan, Pengeluaran, dan Upah', () => {
    const k = table(wb.getWorksheet('Keringanan'));
    assert.deepEqual(k.map((r) => [r.Jumlah, r.Catatan]), [[1000, 'dimaafkan']]);
    const e = table(wb.getWorksheet('Pengeluaran'));
    assert.deepEqual(e.map((r) => [r.Kategori, r.Jumlah, r.Catatan]), [['Listrik', 50000, 'token']]);
    const u = table(wb.getWorksheet('Upah'));
    assert.deepEqual(u.map((r) => [r.Karyawan, r.Upah, r.Catatan]), [['ZZTEST xpt Budi', 30000, 'ramai']]);
    assert.equal(finance.wages.total, 30000);
  });

  it('Utang saat ini: snapshot sisa utang pelanggan', () => {
    const rows = table(wb.getWorksheet('Utang saat ini'));
    const mine = rows.find((r) => String(r.Pelanggan).includes('ZZTEST xpt Warung'));
    assert.equal(mine['Sisa utang'], 8000);
    assert.equal(mine['Jumlah order'], 1);
  });

  it('periode tanpa data tetap menghasilkan berkas valid dengan judul kolom', async () => {
    at('2031-11-20T09:00');
    const dl = await h.download('/api/export/report.xlsx?period=daily&date=2031-11-20', h.pemilik);
    assert.equal(dl.status, 200);
    const empty = await read(dl.buffer);
    assert.equal(table(empty.getWorksheet('Order')).length, 0);
    assert.equal(empty.getWorksheet('Order').getRow(1).getCell(1).value, 'Tanggal');
  });
});

describe('cadangan lengkap', () => {
  it('memuat semua lembar, data batal ditandai, dan tanpa data akun', async () => {
    at('2031-08-10T09:00');
    const dl = await h.download('/api/export/backup.xlsx', h.admin);
    assert.match(dl.headers.get('content-disposition'), /cadangan-tomodachiqua-2031-08-10\.xlsx/);
    const wb = await read(dl.buffer);
    assert.deepEqual(wb.worksheets.map((s) => s.name), [
      'Info', 'Pelanggan', 'Karyawan', 'Order', 'Pembayaran', 'Keringanan', 'Pengeluaran', 'Upah', 'Air masuk', 'Koreksi stok', 'Konsumsi pribadi', 'Pengaturan',
    ]);

    const orders = table(wb.getWorksheet('Order'));
    const batal = orders.filter((r) => r.Status === 'Dibatalkan');
    assert.ok(batal.length >= 1, 'order yang dibatalkan ikut tercatat');
    assert.ok(batal.every((r) => r['Dibatalkan pada']));
    assert.equal(batal[0]['Sisa utang'], 0);

    const info = table(wb.getWorksheet('Info'), { withTotal: true });
    assert.ok(JSON.stringify(info).includes('Cadangan data Tomodachiqua'));
    const pelanggan = table(wb.getWorksheet('Pelanggan'));
    assert.ok(pelanggan.some((r) => r.Nama === 'ZZTEST xpt Warung' && r['Harga khusus'] === 4500 && r.Aktif === 'Ya'));

    // tidak ada data akun/password di mana pun
    const everything = [];
    for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => everything.push(String(c.value?.result ?? c.value))));
    assert.ok(!everything.some((v) => /password_hash|\$2[aby]\$\d{2}\$/i.test(v)), 'tidak ada hash password');
    assert.ok(!everything.some((v) => v === 'xpt_admin' || v === 'xpt_pemilik'), 'tidak ada username akun');
    assert.equal(wb.getWorksheet('Users'), undefined);
  });
});
