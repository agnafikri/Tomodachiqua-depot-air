// Tes laporan, keuangan, dan pengeluaran (database, jam palsu tahun 2031 agar data terisolasi).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { at, createHarness } from './helpers.mjs';

let h;
before(async () => {
  h = await createHarness('rpt');
});
after(async () => {
  await h.close();
});

const post = (path, body, cookie = h.pemilik) => h.api(path, { method: 'POST', cookie, body });
const get = async (path, cookie = h.pemilik) => h.api(path, { cookie });
const order = async (body) => {
  const r = await post('/api/orders', { isDelivered: true, payStatus: 'PAID', ...body });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.order;
};
const expense = async (body, cookie = h.pemilik) => {
  const r = await post('/api/expenses', body, cookie);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.id;
};
const debtTotal = async () => (await get('/api/debts')).json.totals.total;

describe('akses dan validasi', () => {
  it('wajib login', async () => {
    for (const path of ['/api/reports', '/api/finance', '/api/expenses']) {
      assert.equal((await h.api(path)).status, 401, path);
    }
    assert.equal((await h.api('/api/expenses', { method: 'POST', body: {} })).status, 401);
  });

  it('periode dan tanggal tidak valid ditolak', async () => {
    at('2031-06-10T09:00');
    for (const q of ['period=tahunan', 'date=besok', 'date=2031-02-30', 'date=2031-06-11', 'period=weekly&date=2031-13-01']) {
      assert.equal((await get(`/api/reports?${q}`)).status, 400, q);
      assert.equal((await get(`/api/finance?${q}`)).status, 400, q);
    }
  });

  it('tanpa parameter: harian, hari ini menurut jam server', async () => {
    at('2031-06-10T09:00');
    const r = (await get('/api/reports')).json;
    assert.equal(r.period, 'daily');
    assert.deepEqual(r.range, { from: '2031-06-10', to: '2031-06-10' });
    assert.equal(r.today, '2031-06-10');
    assert.equal(r.nextDate, null);
  });
});

describe('laporan dan keuangan satu bulan (Juni 2031)', () => {
  let debtBefore;
  let c;
  let d;

  it('menyiapkan data: order, pembayaran, keringanan, konsumsi pribadi, pengeluaran, dan data batal', async () => {
    at('2031-06-01T08:00');
    debtBefore = await debtTotal();
    c = await h.newCustomer('C', { customPrice: 4500 });
    d = await h.newCustomer('D');

    at('2031-06-02T09:00'); // Senin
    await order({ customerId: c.id, qty: 10 }); // lunas 45.000 (diantar)
    await order({ customerId: null, qty: 2, isDelivered: false }); // lunas 10.000 (diambil)
    await order({ customerId: c.id, qty: 4, payStatus: 'DEBT' }); // utang 18.000
    await post('/api/personal-use', { gallons: 3 });
    await expense({ category: 'LISTRIK', amount: 50000 });

    at('2031-06-03T09:00'); // Selasa
    await order({ customerId: d.id, qty: 5, payStatus: 'DEBT' }); // utang 30.000
    const umum = await order({ customerId: null, qty: 1, payStatus: 'DEBT', note: 'Bu Siti' }); // utang 6.000
    assert.equal((await post('/api/payments', { customerId: c.id, amount: 18000 })).status, 201); // melunasi C
    assert.equal((await post('/api/payments', { customerId: d.id, amount: 10000 })).status, 201); // D sebagian
    assert.equal((await post('/api/payments', { orderId: umum.id, amount: 5000, waiveRemaining: true, note: 'dimaafkan' })).status, 201);
    await expense({ category: 'GALON', amount: 20000 });

    // data yang dibatalkan tidak boleh ikut terhitung
    at('2031-06-05T09:00');
    const salah = await order({ customerId: null, qty: 3 });
    const eSalah = await expense({ category: 'LAIN', amount: 99999 });
    assert.equal((await h.api(`/api/orders/${salah.id}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } })).status, 200);
    assert.equal((await h.api(`/api/expenses/${eSalah}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } })).status, 200);
  });

  it('laporan bulanan: semua angka sesuai hitungan manual', async () => {
    at('2031-06-10T09:00');
    const r = (await get('/api/reports?period=monthly&date=2031-06-10')).json;
    assert.deepEqual(r.range, { from: '2031-06-01', to: '2031-06-30' });
    assert.deepEqual(r.totals, {
      orderCount: 5,
      gallons: 22,
      freeGallons: 0,
      deliveredGallons: 20,
      pickupGallons: 2,
      sales: 109000, // 45.000 + 10.000 + 18.000 + 30.000 + 6.000
      cashIn: 88000, // 45.000 + 10.000 (saat order) + 18.000 + 10.000 + 5.000 (pembayaran utang)
      cashInAtOrder: 55000,
      debtPayments: 33000,
      newDebt: 54000, // 18.000 + 30.000 + 6.000
      waived: 1000,
      personalGallons: 3,
      wages: 0,
      expenses: 70000,
      balance: 18000,
    });
    assert.equal(r.prevDate, '2031-05-01');
    assert.equal(r.nextDate, null, 'Juli belum dimulai pada 10 Juni');
    assert.equal(r.includesToday, true);
  });

  it('rincian per hari berhenti di hari ini dan hari batal tidak terhitung', async () => {
    at('2031-06-10T09:00');
    const r = (await get('/api/reports?period=monthly&date=2031-06-10')).json;
    assert.equal(r.days.length, 10);
    assert.equal(r.days[0].date, '2031-06-01');
    assert.equal(r.days.at(-1).date, '2031-06-10');
    const day = (dt) => r.days.find((x) => x.date === dt);
    assert.deepEqual(day('2031-06-02'), { date: '2031-06-02', orderCount: 3, gallons: 16, sales: 73000, cashIn: 55000, expenses: 50000 });
    assert.deepEqual(day('2031-06-03'), { date: '2031-06-03', orderCount: 2, gallons: 6, sales: 36000, cashIn: 33000, expenses: 20000 });
    assert.deepEqual(day('2031-06-05'), { date: '2031-06-05', orderCount: 0, gallons: 0, sales: 0, cashIn: 0, expenses: 0 });
    const sum = (k) => r.days.reduce((s, x) => s + x[k], 0);
    assert.equal(sum('sales'), r.totals.sales);
    assert.equal(sum('cashIn'), r.totals.cashIn);
    assert.equal(sum('expenses'), r.totals.expenses);
    assert.equal(sum('gallons'), r.totals.gallons);
  });

  it('laporan harian dan mingguan', async () => {
    at('2031-06-10T09:00');
    const daily = (await get('/api/reports?period=daily&date=2031-06-03')).json;
    assert.equal(daily.totals.orderCount, 2);
    assert.equal(daily.totals.sales, 36000);
    assert.equal(daily.totals.cashIn, 33000);
    assert.equal(daily.totals.newDebt, 36000);
    assert.equal(daily.totals.expenses, 20000);
    assert.equal(daily.totals.balance, 13000);
    assert.equal(daily.days.length, 1);
    assert.equal(daily.nextDate, '2031-06-04');

    const weekly = (await get('/api/reports?period=weekly&date=2031-06-03')).json; // Senin 2 s.d. Minggu 8 Juni
    assert.deepEqual(weekly.range, { from: '2031-06-02', to: '2031-06-08' });
    assert.equal(weekly.totals.sales, 109000);
    assert.equal(weekly.totals.cashIn, 88000);
    assert.equal(weekly.days.length, 7);
    assert.equal(weekly.prevDate, '2031-05-26');
    assert.equal(weekly.nextDate, '2031-06-09');
  });

  it('kekekalan: utang akhir = utang awal + utang baru - pelunasan - keringanan', async () => {
    const r = (await get('/api/reports?period=monthly&date=2031-06-10')).json;
    const expected = debtBefore + r.totals.newDebt - r.totals.debtPayments - r.totals.waived;
    assert.equal(await debtTotal(), expected);
  });

  it('keuangan: pemasukan, pengeluaran per kategori, saldo, dan keringanan terpisah', async () => {
    const f = (await get('/api/finance?period=monthly&date=2031-06-10')).json;
    assert.deepEqual(f.income, { total: 88000, atOrder: 55000, debtPayments: 33000 });
    assert.equal(f.waived, 1000, 'keringanan bukan bagian dari pemasukan');
    assert.equal(f.expenses.total, 70000);
    assert.deepEqual(
      f.expenses.byCategory.map((x) => [x.category, x.label, x.amount, x.count, x.percent]),
      [['LISTRIK', 'Listrik', 50000, 1, 71], ['GALON', 'Galon dan segel', 20000, 1, 29]],
    );
    assert.equal(f.balance, 18000);
    assert.ok(f.categories.some((x) => x.code === 'LISTRIK' && x.label === 'Listrik'));
  });

  it('daftar pengeluaran: terbaru di atas; pemilik hanya bisa batalkan yang dibuat hari ini', async () => {
    at('2031-06-10T09:00');
    const list = (await get('/api/expenses?period=monthly&date=2031-06-10')).json;
    assert.deepEqual(list.range, { from: '2031-06-01', to: '2031-06-30' });
    assert.deepEqual(list.items.map((i) => [i.spentDate, i.category, i.amount]), [['2031-06-03', 'GALON', 20000], ['2031-06-02', 'LISTRIK', 50000]]);
    assert.ok(list.items.every((i) => i.canVoid === false), 'dibuat di hari lain');
    const asAdmin = (await get('/api/expenses?period=monthly&date=2031-06-10', h.admin)).json;
    assert.ok(asAdmin.items.every((i) => i.canVoid === true));
    assert.equal(list.items[0].byName, 'Pemilik Uji');
  });
});

describe('batas hari dan bulan (zona Jakarta)', () => {
  it('23:59 WIB masuk bulan itu, 00:01 WIB masuk bulan berikutnya (walau UTC masih bulan lalu)', async () => {
    at('2031-07-31T23:59');
    await order({ customerId: null, qty: 1 }); // 6.000
    at('2031-08-01T00:01'); // = 2031-07-31 17:01 UTC
    await order({ customerId: null, qty: 2 }); // 12.000
    at('2031-08-02T09:00');
    const jul = (await get('/api/reports?period=monthly&date=2031-07-15')).json;
    const aug = (await get('/api/reports?period=monthly&date=2031-08-02')).json;
    assert.equal(jul.totals.sales, 6000);
    assert.equal(jul.totals.cashIn, 6000);
    assert.equal(aug.totals.sales, 12000);
    assert.equal(aug.totals.cashIn, 12000);
    const d31 = (await get('/api/reports?period=daily&date=2031-07-31')).json;
    const d01 = (await get('/api/reports?period=daily&date=2031-08-01')).json;
    assert.equal(d31.totals.sales, 6000);
    assert.equal(d01.totals.sales, 12000);
  });

  it('galon gratis dari paket dan diantar vs diambil dilaporkan terpisah', async () => {
    at('2031-09-01T09:00');
    const p = await h.newCustomer('Paket', { customPrice: 4500, bundleBuy: 10, bundlePay: 9 });
    await order({ customerId: p.id, qty: 20 }); // bayar 18, gratis 2
    await order({ customerId: null, qty: 3, isDelivered: false });
    const r = (await get('/api/reports?period=daily&date=2031-09-01')).json;
    assert.equal(r.totals.gallons, 23);
    assert.equal(r.totals.freeGallons, 2);
    assert.equal(r.totals.deliveredGallons, 20);
    assert.equal(r.totals.pickupGallons, 3);
    assert.equal(r.totals.sales, 18 * 4500 + 3 * 5000);
  });

  it('periode tanpa data: semua nol', async () => {
    at('2031-11-20T09:00');
    const r = (await get('/api/reports?period=weekly&date=2031-11-20')).json;
    assert.equal(r.totals.orderCount, 0);
    assert.equal(r.totals.cashIn, 0);
    assert.equal(r.totals.balance, 0);
    const f = (await get('/api/finance?period=weekly&date=2031-11-20')).json;
    assert.deepEqual(f.expenses, { total: 0, byCategory: [] });
  });
});

describe('mencatat pengeluaran', () => {
  it('validasi', async () => {
    at('2031-10-01T09:00');
    const bad = [
      [{ category: 'LISTRIK', amount: 0 }, 'amount'],
      [{ category: 'LISTRIK', amount: -5 }, 'amount'],
      [{ category: 'LISTRIK', amount: 100.5 }, 'amount'],
      [{ category: 'LISTRIK' }, 'amount'],
      [{ category: 'TIDAK_ADA', amount: 1000 }, 'category'],
      [{ amount: 1000 }, 'category'],
      [{ category: 'LISTRIK', amount: 1000, spentDate: '2031-10-02' }, 'spentDate'],
      [{ category: 'LISTRIK', amount: 1000, spentDate: 'kemarin' }, 'spentDate'],
      [{ category: 'LISTRIK', amount: 1000, spentDate: '2031-02-30' }, 'spentDate'],
    ];
    for (const [body, field] of bad) {
      const r = await post('/api/expenses', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.json.error.details.some((x) => x.field === field), `${JSON.stringify(body)} -> ${field}`);
    }
  });

  it('boleh tanggal lampau (masuk periode tanggal itu) dengan catatan', async () => {
    at('2031-10-05T09:00');
    await expense({ category: 'TRANSPORT', amount: 15000, spentDate: '2031-10-03', note: 'bensin antar' });
    const f = (await get('/api/finance?period=daily&date=2031-10-03')).json;
    assert.equal(f.expenses.total, 15000);
    const list = (await get('/api/expenses?period=daily&date=2031-10-03')).json;
    assert.equal(list.items[0].note, 'bensin antar');
    assert.equal((await get('/api/finance?period=daily&date=2031-10-05')).json.expenses.total, 0);
  });

  it('pencatatan ganda dengan clientRequestId yang sama hanya sekali', async () => {
    at('2031-10-06T09:00');
    const body = { category: 'LISTRIK', amount: 777000, clientRequestId: crypto.randomUUID() };
    const [x, y] = await Promise.all([post('/api/expenses', body), post('/api/expenses', body)]);
    assert.deepEqual([x.status, y.status].sort(), [200, 201]);
    assert.equal(x.json.id, y.json.id);
    assert.equal((await get('/api/finance?period=daily&date=2031-10-06')).json.expenses.total, 777000);
  });

  it('membatalkan: pemilik hanya yang dibuat hari ini; admin kapan saja; hasil batal tidak terhitung', async () => {
    at('2031-10-07T09:00');
    const mine = await expense({ category: 'LAIN', amount: 11000 });
    at('2031-10-08T09:00'); // hari berikutnya
    const denied = await h.api(`/api/expenses/${mine}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } });
    assert.equal(denied.status, 403);
    assert.equal(denied.json.error.code, 'VOID_NOT_ALLOWED');
    assert.equal((await get('/api/finance?period=daily&date=2031-10-07')).json.expenses.total, 11000);

    assert.equal((await h.api(`/api/expenses/${mine}`, { method: 'PATCH', cookie: h.admin, body: { voided: true } })).status, 200);
    assert.equal((await get('/api/finance?period=daily&date=2031-10-07')).json.expenses.total, 0);
    assert.equal((await h.api(`/api/expenses/${mine}`, { method: 'PATCH', cookie: h.admin, body: { voided: true } })).status, 409);
    assert.equal((await h.api('/api/expenses/999999999', { method: 'PATCH', cookie: h.admin, body: { voided: true } })).status, 404);
    assert.equal((await h.api(`/api/expenses/${mine}`, { method: 'PATCH', cookie: h.admin, body: { amount: 5 } })).status, 400);

    const today = await expense({ category: 'LAIN', amount: 22000 });
    assert.equal((await h.api(`/api/expenses/${today}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } })).status, 200);
  });
});
