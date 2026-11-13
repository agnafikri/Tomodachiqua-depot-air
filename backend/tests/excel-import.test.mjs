// Tes impor Excel: template, validasi per baris (dry-run), simpan atomik, berkas ganda, dan pembatalan impor.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db/pool.mjs';
import { at, createHarness } from './helpers.mjs';
import { book, read } from './xlsx.mjs';

let h;
const post = (path, body, cookie = h.pemilik) => h.api(path, { method: 'POST', cookie, body });
const get = (path, cookie = h.pemilik) => h.api(path, { cookie });
const check = (slug, buffer, opts = {}) => h.upload(`/api/import/${slug}/check`, buffer, { cookie: h.admin, ...opts });
const commit = (slug, buffer, opts = {}) => h.upload(`/api/import/${slug}`, buffer, { cookie: h.admin, ...opts });
const undo = (id, cookie = h.admin) => h.api(`/api/import/batches/${id}`, { method: 'PATCH', cookie, body: { voided: true } });
const has = (errors, row, column) => errors.some((e) => e.row === row && e.column === column);
const count = async (sql, params = []) => (await pool.query(sql, params)).rows[0].n;

before(async () => {
  h = await createHarness('imp');
  at('2031-09-30T12:00');
});
after(async () => {
  await h.close();
});

describe('akses', () => {
  it('semua rute impor: wajib login, khusus ADMIN', async () => {
    const file = await book('EXPENSES', [['2031-09-05', 'Listrik', 1000, '']]);
    for (const cookie of [undefined, h.pemilik]) {
      const want = cookie ? 403 : 401;
      assert.equal((await h.download('/api/import/templates/pengeluaran', cookie)).status, want);
      assert.equal((await h.download('/api/import/batches', cookie)).status, want);
      assert.equal((await h.upload('/api/import/pengeluaran/check', file, { cookie })).status, want);
      assert.equal((await h.upload('/api/import/pengeluaran', file, { cookie })).status, want);
      assert.equal((await h.api('/api/import/batches/1', { method: 'PATCH', cookie, body: { voided: true } })).status, want);
    }
  });
});

describe('template', () => {
  it('tiga template: judul kolom sesuai, ada lembar Petunjuk, dan pilihan dropdown', async () => {
    const want = {
      pelanggan: ['Nama', 'Telepon', 'Alamat', 'Harga khusus', 'Paket beli', 'Paket bayar', 'Aktif'],
      order: ['Tanggal', 'Jam', 'Pelanggan', 'Jumlah galon', 'Diantar', 'Status', 'Dibayar', 'Catatan'],
      pengeluaran: ['Tanggal', 'Kategori', 'Jumlah', 'Catatan'],
    };
    for (const [slug, headers] of Object.entries(want)) {
      const dl = await h.download(`/api/import/templates/${slug}.xlsx`, h.admin);
      assert.equal(dl.status, 200, slug);
      assert.match(dl.headers.get('content-disposition'), new RegExp(`template-${slug}\\.xlsx`));
      const wb = await read(dl.buffer);
      assert.ok(wb.getWorksheet('Petunjuk'), 'ada petunjuk');
      const ws = wb.worksheets.find((s) => s.name !== 'Petunjuk');
      assert.deepEqual(headers.map((_, i) => ws.getRow(1).getCell(i + 1).value), headers);
      let filled = 0;
      ws.eachRow((row, n) => { if (n > 1 && row.values.some((v) => v !== null && v !== undefined && v !== '')) filled += 1; });
      assert.equal(filled, 0, 'lembar data hanya berisi judul kolom (baris lain kosong)');
    }
    const orderWs = (await read((await h.download('/api/import/templates/order', h.admin)).buffer)).getWorksheet('Order');
    assert.equal(orderWs.getCell('F2').dataValidation?.type, 'list'); // Status
    assert.equal(orderWs.getCell('E2').dataValidation?.type, 'list'); // Diantar
  });

  it('template kosong ditolak dengan pesan jelas; jenis tidak dikenal 404', async () => {
    const empty = (await h.download('/api/import/templates/pelanggan', h.admin)).buffer;
    const r = await check('pelanggan', empty);
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'EMPTY_FILE');
    assert.equal((await h.download('/api/import/templates/ngawur', h.admin)).status, 404);
    assert.equal((await check('ngawur', empty)).status, 404);
  });
});

describe('validasi berkas', () => {
  it('bukan Excel .xlsx / rusak / tanpa berkas / terlalu besar', async () => {
    const txt = await check('pengeluaran', Buffer.from('Tanggal,Kategori,Jumlah\n2031-09-05,Listrik,1000'));
    assert.equal(txt.status, 400);
    assert.equal(txt.json.error.code, 'INVALID_FILE');
    assert.equal((await check('pengeluaran', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]))).json.error.code, 'INVALID_FILE', 'format .xls lama');
    assert.equal((await check('pengeluaran', Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(200, 7)]))).json.error.code, 'INVALID_FILE', 'zip rusak');
    assert.equal((await check('pengeluaran', null)).json.error.code, 'NO_FILE');
    const big = await check('pengeluaran', Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(5 * 1024 * 1024 + 10)]));
    assert.equal(big.status, 413);
    assert.equal(big.json.error.code, 'FILE_TOO_LARGE');
  });

  it('kolom wajib hilang atau salah template', async () => {
    const noCat = await book('EXPENSES', [['2031-09-05', 1000]], { headers: ['Tanggal', 'Jumlah'] });
    const r = await check('pengeluaran', noCat);
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'WRONG_TEMPLATE');
    assert.match(r.json.error.message, /Kategori/);
    const customersFile = await book('CUSTOMERS', [['ZZTEST imp Salah']]);
    assert.equal((await check('order', customersFile)).json.error.code, 'WRONG_TEMPLATE');
  });

  it('lebih dari 5.000 baris ditolak', async () => {
    const rows = Array.from({ length: 5001 }, () => ['2031-09-05', 'Listrik', 1000, '']);
    const r = await check('pengeluaran', await book('EXPENSES', rows));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'TOO_MANY_ROWS');
  });

  it('baris kosong dilewati tetapi nomor baris galat tetap nomor baris Excel', async () => {
    const f = await book('EXPENSES', [['2031-09-05', 'Listrik', 1000, ''], [], ['2031-09-05', 'Ngawur', 1000, '']]);
    const { result } = (await check('pengeluaran', f)).json;
    assert.equal(result.rowCount, 2);
    assert.deepEqual(result.errors.map((e) => [e.row, e.column]), [[4, 'Kategori']]);
  });
});

describe('impor pelanggan', () => {
  const header = (rows) => book('CUSTOMERS', rows);
  let okFile;
  let batchId;

  it('periksa: semua jenis galat dilaporkan per baris dan kolom, tidak ada yang tersimpan', async () => {
    await h.newCustomer('Exists');
    const before = await count("SELECT count(*)::int AS n FROM customers WHERE name LIKE 'ZZTEST imp%'");
    const bad = await header([
      ['', '', '', '', '', '', ''], // 2: nama kosong (baris tidak kosong karena sel lain '')? -> baris ini dianggap kosong
      ['ZZTEST imp X1', '', '', 0, '', '', ''], // 3
      ['ZZTEST imp X2', '', '', '', 10, '', ''], // 4
      ['ZZTEST imp X3', '', '', '', 10, 10, ''], // 5
      ['ZZTEST imp Dup', '', '', '', '', '', ''], // 6 valid
      ['zztest imp dup', '', '', '', '', '', ''], // 7 kembar di berkas
      ['ZZTEST imp X4', '', '', '', '', '', 'mungkin'], // 8
      ['ZZTEST imp Exists', '', '', '', '', '', ''], // 9 sudah ada di aplikasi
      ['ZZTEST imp X5', '', '', 'abc', '', '', ''], // 10
      ['', '0812', '', '', '', '', ''], // 11 nama kosong tapi ada isi lain
    ]);
    const r = (await check('pelanggan', bad)).json.result;
    assert.equal(r.validCount, 1);
    assert.equal(r.canCommit, false);
    assert.ok(has(r.errors, 3, 'Harga khusus'));
    assert.ok(has(r.errors, 4, 'Paket bayar'));
    assert.ok(has(r.errors, 5, 'Paket bayar'));
    assert.ok(has(r.errors, 7, 'Nama'));
    assert.match(r.errors.find((e) => e.row === 7).message, /baris 6/);
    assert.ok(has(r.errors, 8, 'Aktif'));
    assert.ok(has(r.errors, 9, 'Nama'));
    assert.match(r.errors.find((e) => e.row === 9).message, /sudah ada/);
    assert.ok(has(r.errors, 10, 'Harga khusus'));
    assert.ok(has(r.errors, 11, 'Nama'));
    assert.equal(r.errorCount, 8);
    assert.equal(await count("SELECT count(*)::int AS n FROM customers WHERE name LIKE 'ZZTEST imp%'"), before, 'dry-run tidak menyimpan');

    const c = await commit('pelanggan', bad);
    assert.equal(c.status, 400);
    assert.equal(c.json.error.code, 'IMPORT_INVALID');
    assert.equal(await count("SELECT count(*)::int AS n FROM customers WHERE name LIKE 'ZZTEST imp%'"), before, 'semua atau tidak sama sekali');
  });

  it('simpan berkas yang benar: pelanggan, harga khusus, paket, dan status aktif tersimpan', async () => {
    okFile = await header([
      ['ZZTEST imp Warung A', '0812', 'Pasar', '4.500', 10, 9, 'Ya'],
      ['ZZTEST imp Pak B', '', '', '', '', '', 'Tidak'],
    ]);
    const chk = (await check('pelanggan', okFile)).json.result;
    assert.equal(chk.canCommit, true);
    assert.deepEqual([chk.summary.count, chk.summary.withCustomPrice, chk.summary.withBundle, chk.summary.inactive], [2, 1, 1, 1]);
    assert.equal(chk.preview[0].bundle, '10 bayar 9');

    const r = await commit('pelanggan', okFile, { fileName: 'pelanggan ünïcode.xlsx' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    batchId = r.json.import.batchId;
    const list = (await get('/api/customers?active=all&q=ZZTEST imp')).json.customers;
    const a = list.find((x) => x.name === 'ZZTEST imp Warung A');
    assert.deepEqual([a.customPrice, a.bundleBuy, a.bundlePay, a.isActive, a.phone, a.address], [4500, 10, 9, true, '0812', 'Pasar']);
    assert.equal(list.find((x) => x.name === 'ZZTEST imp Pak B').isActive, false);

    const batches = (await get('/api/import/batches', h.admin)).json.batches;
    const b = batches.find((x) => x.id === batchId);
    assert.deepEqual([b.kind, b.kindLabel, b.rowCount, b.byName, b.fileName, b.voidedAt], ['CUSTOMERS', 'Pelanggan', 2, 'Admin Uji', 'pelanggan ünïcode.xlsx', null]);
  });

  it('berkas yang sama tidak bisa diimpor dua kali', async () => {
    const chk = (await check('pelanggan', okFile)).json.result;
    assert.equal(chk.alreadyImported.id, batchId);
    assert.equal(chk.canCommit, false);
    const again = await commit('pelanggan', okFile);
    assert.equal(again.status, 409);
    assert.equal(again.json.error.code, 'ALREADY_IMPORTED');
  });

  it('dua simpan serentak untuk berkas yang sama: hanya satu berhasil', async () => {
    const f = await header([['ZZTEST imp Serentak 1'], ['ZZTEST imp Serentak 2']]);
    const [x, y] = await Promise.all([commit('pelanggan', f), commit('pelanggan', f)]);
    assert.deepEqual([x.status, y.status].sort(), [201, 409]);
    assert.equal(await count("SELECT count(*)::int AS n FROM customers WHERE name LIKE 'ZZTEST imp Serentak%'"), 2);
  });

  it('membatalkan impor pelanggan: pelanggan tetap ada; batal dua kali = 409', async () => {
    const r = await undo(batchId);
    assert.equal(r.status, 200);
    assert.equal(r.json.voidedOrders, 0);
    assert.equal(await count("SELECT count(*)::int AS n FROM customers WHERE name = 'ZZTEST imp Warung A'"), 1);
    assert.equal((await undo(batchId)).status, 409);
    assert.equal((await undo(999999999)).status, 404);
    const chk = (await check('pelanggan', okFile)).json.result; // berkas lama kini ditolak karena nama sudah ada
    assert.equal(chk.alreadyImported, null);
    assert.ok(chk.errors.every((e) => /sudah ada/.test(e.message)));
  });
});

describe('impor order lama', () => {
  let cA;
  let cB;
  let cI;
  let okFile;
  let batchId;
  const orderRows = () => [
    ['2031-09-01', '09:30', 'ZZTEST imp Pelanggan A', 20, 'Ya', 'Utang', 40000, ''],
    ['2031-09-02', '', '', 3, 'Tidak', 'Lunas', '', ''],
    ['02/09/2031', '14.15', 'zztest imp pelanggan b', 2, 'ya', 'LUNAS', '', ''],
    [new Date(Date.UTC(2031, 8, 3)), 0.5, '', 1, 'Ya', 'Utang', '', 'Pak Dedi RT 3'],
    ['2031-09-04', '', 'ZZTEST imp Nonaktif', 5, 'Tidak', 'Utang', '', ''],
  ];

  it('menyiapkan pelanggan (harga khusus + paket, standar, dan nonaktif) dan koreksi stok', async () => {
    cA = await h.newCustomer('Pelanggan A', { customPrice: 4500, bundleBuy: 10, bundlePay: 9 });
    cB = await h.newCustomer('Pelanggan B');
    cI = await h.newCustomer('Nonaktif');
    await h.api(`/api/customers/${cI.id}`, { method: 'PATCH', cookie: h.pemilik, body: { isActive: false } });
    at('2031-09-02T00:00');
    assert.equal((await post('/api/tank/adjustments', { litersAfter: 3000 })).status, 201);
    at('2031-09-30T12:00');
  });

  it('periksa: harga dihitung aturan aplikasi; ringkasan, pratinjau, dan peringatan stok benar', async () => {
    okFile = await book('ORDERS', orderRows());
    const r = (await check('order', okFile)).json.result;
    assert.equal(r.canCommit, true, JSON.stringify(r.errors));
    assert.equal(r.validCount, 5);
    assert.deepEqual(r.summary, {
      count: 5, gallons: 31, totalValue: 139000, paidAtOrder: 67000, unpaid: 72000,
      paidCount: 2, debtCount: 3, dateFrom: '2031-09-01', dateTo: '2031-09-04', afterLastAdjustment: 4,
    });
    const first = r.preview[0];
    assert.deepEqual([first.customer, first.qty, first.unitPrice, first.freeQty, first.total, first.paid], ['ZZTEST imp Pelanggan A', 20, 4500, 2, 81000, 40000]);
    assert.equal(r.preview[1].customer, 'Umum');
    assert.ok(r.warnings.some((w) => /4 order/.test(w) && /stok/.test(w)));
    assert.equal(await count("SELECT count(*)::int AS n FROM orders WHERE import_batch_id IS NOT NULL AND created_by = (SELECT id FROM users WHERE username = 'imp_admin')"), 0);
  });

  it('periksa: setiap jenis galat tercatat di baris dan kolom yang benar', async () => {
    const bad = await book('ORDERS', [
      ['2031-10-01', '', '', 1, 'Ya', 'Lunas', '', ''], // 2 masa depan
      ['2031-09-01', '', 'ZZTEST imp Tidak Ada', 1, 'Ya', 'Lunas', '', ''], // 3
      ['2031-09-01', '', '', 0, 'Ya', 'Lunas', '', ''], // 4
      ['2031-09-01', '', '', 1001, 'Ya', 'Lunas', '', ''], // 5
      ['2031-09-01', '', '', 1.5, 'Ya', 'Lunas', '', ''], // 6
      ['2031-09-01', '', '', 1, '', 'Lunas', '', ''], // 7
      ['2031-09-01', '', '', 1, 'Ya', 'Mungkin', '', ''], // 8
      ['2031-09-01', '', '', 1, 'Ya', 'Lunas', 5000, ''], // 9
      ['2031-09-01', '', 'ZZTEST imp Pelanggan B', 1, 'Ya', 'Utang', 6000, ''], // 10
      ['2031-09-01', '', '', 1, 'Ya', 'Utang', '', ''], // 11
      ['kemarin', '', '', 1, 'Ya', 'Lunas', '', ''], // 12
      ['2031-09-01', '25:00', '', 1, 'Ya', 'Lunas', '', ''], // 13
      ['2031-09-01', '', '', 1, 'Ya', 'Lunas', '-5', ''], // 14
    ]);
    const r = (await check('order', bad)).json.result;
    const want = [[2, 'Tanggal'], [3, 'Pelanggan'], [4, 'Jumlah galon'], [5, 'Jumlah galon'], [6, 'Jumlah galon'], [7, 'Diantar'], [8, 'Status'], [9, 'Dibayar'], [10, 'Dibayar'], [11, 'Catatan'], [12, 'Tanggal'], [13, 'Jam'], [14, 'Dibayar']];
    for (const [row, col] of want) assert.ok(has(r.errors, row, col), `baris ${row} kolom ${col}`);
    assert.equal(r.errorCount, 13);
    assert.equal(r.validCount, 0);
    assert.equal(r.canCommit, false);
    assert.match(r.errors.find((e) => e.row === 3).message, /Impor template Pelanggan/);
    assert.match(r.errors.find((e) => e.row === 9).message, /Rp 6000/);
    assert.equal((await commit('order', bad)).json.error.code, 'IMPORT_INVALID');
  });

  it('simpan: order, harga, pembayaran, utang, laporan, dan stok sesuai', async () => {
    const r = await commit('order', okFile);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    batchId = r.json.import.batchId;
    assert.equal(r.json.import.imported, 5);

    const a = (await get(`/api/orders?from=2031-09-01&to=2031-09-04&customerId=${cA.id}`)).json.orders[0];
    assert.deepEqual([a.qty, a.unitPrice, a.freeQty, a.total, a.paidAmount, a.paymentStatus, a.isDelivered], [20, 4500, 2, 81000, 40000, 'PARTIAL', true]);
    const b = (await get(`/api/orders?from=2031-09-02&to=2031-09-02&customerId=${cB.id}`)).json.orders[0];
    assert.equal(b.total, 12000);
    assert.equal(b.paymentStatus, 'PAID');
    assert.equal(b.orderedAt, '2031-09-02T07:15:00.000Z', '14:15 WIB');

    const debts = (await get('/api/debts')).json;
    assert.equal(debts.customers.find((c) => c.customerId === cA.id).outstanding, 41000);
    assert.equal(debts.customers.find((c) => c.customerId === cI.id).outstanding, 25000, 'pelanggan nonaktif tetap bisa diimpor');
    assert.equal(debts.customers.find((c) => c.customerId === cB.id), undefined, 'lunas');
    const umum = debts.umumOrders.find((o) => o.note === 'Pak Dedi RT 3');
    assert.equal(umum.outstanding, 6000);

    const day = (await get('/api/reports?period=daily&date=2031-09-02')).json.totals;
    assert.deepEqual([day.sales, day.cashIn, day.orderCount], [27000, 27000, 2]);

    const tank = (await get('/api/tank')).json.tank;
    assert.equal(tank.remainingLiters, 3000 - 11 * 19, 'hanya order setelah koreksi stok yang mengurangi stok');
    const batch = (await get('/api/import/batches', h.admin)).json.batches.find((x) => x.id === batchId);
    assert.equal(batch.summary.totalValue, 139000);
  });

  it('membatalkan impor: order, pembayaran, dan utang ikut batal; berkas boleh diimpor lagi', async () => {
    const r = await undo(batchId);
    assert.equal(r.status, 200);
    assert.equal(r.json.voidedOrders, 5);
    const debts = (await get('/api/debts')).json;
    assert.equal(debts.customers.find((c) => c.customerId === cA.id), undefined);
    assert.equal(debts.umumOrders.find((o) => o.note === 'Pak Dedi RT 3'), undefined);
    assert.equal((await get('/api/reports?period=daily&date=2031-09-02')).json.totals.sales, 0);
    assert.equal((await get('/api/tank')).json.tank.remainingLiters, 3000);
    assert.equal(await count('SELECT count(*)::int AS n FROM payments WHERE order_id IN (SELECT id FROM orders WHERE import_batch_id = $1) AND voided_at IS NULL', [batchId]), 0);

    const chk = (await check('order', okFile)).json.result;
    assert.equal(chk.alreadyImported, null);
    assert.equal(chk.canCommit, true);
    assert.equal((await commit('order', okFile)).status, 201);
  });
});

describe('impor pengeluaran', () => {
  it('periksa: galat per baris, upah ditolak, kategori boleh nama atau kode', async () => {
    const bad = await book('EXPENSES', [
      ['2031-09-05', 'Upah', 50000, ''], // 2
      ['2031-09-05', 'Ngawur', 1000, ''], // 3
      ['2031-10-05', 'Listrik', 1000, ''], // 4 masa depan
      ['2031-09-05', 'Listrik', 0, ''], // 5
      ['2031-09-05', 'Listrik', 'abc', ''], // 6
      ['', 'Listrik', 1000, ''], // 7
      ['2031-09-05', '', 1000, ''], // 8
      ['2031-09-05', 'Gaji dan upah', 1000, ''], // 9
    ]);
    const r = (await check('pengeluaran', bad)).json.result;
    for (const [row, col] of [[2, 'Kategori'], [3, 'Kategori'], [4, 'Tanggal'], [5, 'Jumlah'], [6, 'Jumlah'], [7, 'Tanggal'], [8, 'Kategori'], [9, 'Kategori']]) {
      assert.ok(has(r.errors, row, col), `baris ${row} kolom ${col}`);
    }
    assert.match(r.errors.find((e) => e.row === 2).message, /menu Upah/);
    assert.match(r.errors.find((e) => e.row === 3).message, /Listrik/);
    assert.equal(r.validCount, 0);
  });

  it('simpan, tampil di Keuangan, lalu batalkan impor', async () => {
    const f = await book('EXPENSES', [
      ['2031-09-05', 'Listrik', 150000, 'token'],
      ['2031-09-06', 'bensin dan transport', '35.000', ''],
      ['06/09/2031', 'LAIN', 12000, ''],
      ['2031-09-07', 'GALON', 80000, 'segel'],
    ]);
    const chk = (await check('pengeluaran', f)).json.result;
    assert.deepEqual([chk.summary.count, chk.summary.total, chk.summary.dateFrom, chk.summary.dateTo], [4, 277000, '2031-09-05', '2031-09-07']);
    assert.deepEqual(chk.preview.map((p) => p.category), ['Listrik', 'Bensin dan transport', 'Lain-lain', 'Galon dan segel']);

    const r = await commit('pengeluaran', f);
    assert.equal(r.status, 201);
    const fin = (await get('/api/finance?period=monthly&date=2031-09-30')).json;
    assert.equal(fin.expenses.total, 277000);
    assert.equal(fin.expenses.byCategory.find((c) => c.category === 'LISTRIK').amount, 150000);
    assert.equal(fin.expenses.byCategory.find((c) => c.category === 'GALON').label, 'Galon dan segel');

    const u = await undo(r.json.import.batchId);
    assert.equal(u.json.voidedExpenses, 4);
    assert.equal((await get('/api/finance?period=monthly&date=2031-09-30')).json.expenses.total, 0);
  });

  it('1.200 baris tersimpan cepat dan lengkap dalam satu transaksi', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ['2031-09-10', 'Lain-lain', 1000 + i, `baris ${i}`]);
    const t0 = Date.now();
    const r = await commit('pengeluaran', await book('EXPENSES', rows));
    assert.equal(r.status, 201, JSON.stringify(r.json).slice(0, 300));
    assert.ok(Date.now() - t0 < 15000, 'cukup cepat');
    assert.equal(await count('SELECT count(*)::int AS n FROM expenses WHERE import_batch_id = $1', [r.json.import.batchId]), 1200);
    assert.equal(await count('SELECT SUM(amount)::int AS n FROM expenses WHERE import_batch_id = $1', [r.json.import.batchId]), 1200 * 1000 + (1199 * 1200) / 2);
  });
});
