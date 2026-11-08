// Tes stok toren, air masuk, koreksi, dan konsumsi pribadi (database + jam palsu di tahun 2031
// agar tidak tercampur data lain di database).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { at, createHarness } from './helpers.mjs';

let h;
before(async () => {
  h = await createHarness('tnk');
});
after(async () => {
  await h.close();
});

const tank = async (cookie = h.pemilik) => (await h.api('/api/tank', { cookie })).json.tank;
const post = (path, body, cookie = h.pemilik) => h.api(path, { method: 'POST', cookie, body });
const adjust = (litersAfter, extra = {}) => post('/api/tank/adjustments', { litersAfter, ...extra });
const order = async (qty, extra = {}) => {
  const r = await post('/api/orders', { customerId: null, qty, isDelivered: false, payStatus: 'PAID', ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.order;
};

describe('akses dan validasi', () => {
  it('wajib login', async () => {
    assert.equal((await h.api('/api/tank')).status, 401);
    assert.equal((await h.api('/api/tank/history')).status, 401);
    assert.equal((await h.api('/api/personal-use', { method: 'POST', body: {} })).status, 401);
  });

  it('koreksi dan air masuk tidak boleh melebihi kapasitas 6000 L; 6000 boleh', async () => {
    at('2031-01-01T08:00');
    const r = await adjust(6001);
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'EXCEEDS_CAPACITY');
    assert.equal((await post('/api/tank/refills', { liters: 6001 })).json.error.code, 'EXCEEDS_CAPACITY');
    assert.equal((await adjust(6000)).status, 201);
  });

  it('input tidak valid ditolak', async () => {
    at('2031-01-01T09:00');
    for (const [path, body] of [
      ['/api/tank/adjustments', { litersAfter: -1 }],
      ['/api/tank/adjustments', { litersAfter: 10.5 }],
      ['/api/tank/adjustments', {}],
      ['/api/tank/refills', { liters: 0 }],
      ['/api/tank/refills', { liters: 100, refillDate: '2031-01-02' }], // masa depan
      ['/api/tank/refills', { liters: 100, refillDate: 'kemarin' }],
      ['/api/tank/refills', { liters: 100, refillDate: '2031-02-31' }],
      ['/api/personal-use', { gallons: 0 }],
      ['/api/personal-use', { gallons: 501 }],
      ['/api/personal-use', { gallons: 2, useDate: '2031-01-05' }],
    ]) {
      assert.equal((await post(path, body)).status, 400, `${path} ${JSON.stringify(body)}`);
    }
  });
});

describe('hitungan sisa air', () => {
  it('koreksi menjadi titik awal; order sebelum koreksi tidak dihitung, sesudahnya dihitung', async () => {
    at('2031-01-10T07:00');
    await order(10); // sebelum koreksi: sudah tercermin di angka koreksi
    at('2031-01-10T08:00');
    assert.equal((await adjust(5000)).status, 201);
    let t = await tank();
    assert.equal(t.known, true);
    assert.equal(t.remainingLiters, 5000);
    assert.equal(t.percent, 83);
    assert.equal(t.gallonsLeft, 263);

    at('2031-01-10T09:00');
    await order(10); // 190 L
    t = await tank();
    assert.equal(t.remainingLiters, 5000 - 190);
  });

  it('galon gratis dari paket tetap mengurangi stok (jumlah fisik)', async () => {
    at('2031-01-10T10:00');
    const c = await h.newCustomer('Paket', { customPrice: 4500, bundleBuy: 10, bundlePay: 9 });
    const o = await order(20, { customerId: c.id, isDelivered: true }); // bayar 18, fisik 20
    assert.equal(o.paidQty, 18);
    assert.equal((await tank()).remainingLiters, 5000 - 190 - 20 * 19);
  });

  it('air masuk: hari ini dihitung sejak dicatat; tanggal lampau sebelum koreksi tidak dihitung', async () => {
    at('2031-01-10T11:00');
    const before = (await tank()).remainingLiters;
    assert.equal((await post('/api/tank/refills', { liters: 1000 })).status, 201);
    assert.equal((await tank()).remainingLiters, before + 1000);

    // dicatat belakangan tetapi tanggalnya kemarin: terjadi sebelum koreksi pukul 08.00 hari ini
    assert.equal((await post('/api/tank/refills', { liters: 800, refillDate: '2031-01-09' })).status, 201);
    assert.equal((await tank()).remainingLiters, before + 1000, 'air masuk kemarin sudah termasuk dalam angka koreksi');
  });

  it('koreksi baru menggantikan hitungan sebelumnya', async () => {
    at('2031-01-10T12:00');
    await adjust(3000, { note: 'diukur langsung' });
    const t = await tank();
    assert.equal(t.remainingLiters, 3000);
    assert.equal(t.refillLitersSince, 0);
    assert.equal(t.gallonsSince, 0);
  });

  it('konsumsi pribadi mengurangi stok dan bisa dibatalkan; order batal tidak dihitung', async () => {
    at('2031-01-10T13:00');
    const p = await post('/api/personal-use', { gallons: 3, note: 'cuci motor' });
    assert.equal(p.status, 201);
    assert.equal((await tank()).remainingLiters, 3000 - 57);

    const o = await order(5);
    assert.equal((await tank()).remainingLiters, 3000 - 57 - 95);
    await h.api(`/api/orders/${o.id}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } });
    assert.equal((await tank()).remainingLiters, 3000 - 57);

    await h.api(`/api/personal-use/${p.json.id}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } });
    assert.equal((await tank()).remainingLiters, 3000);
  });

  it('konsumsi pribadi tidak masuk pendapatan (tidak ada order/pembayaran)', async () => {
    at('2031-01-10T14:00');
    const before = (await h.api('/api/summary', { cookie: h.pemilik })).json.orders;
    await post('/api/personal-use', { gallons: 2 });
    const after = (await h.api('/api/summary', { cookie: h.pemilik })).json.orders;
    assert.deepEqual(after, before);
  });
});

describe('perkiraan habis', () => {
  it('memakai rata-rata 7 hari terakhir', async () => {
    at('2031-02-01T08:00');
    await adjust(6000);
    at('2031-02-01T09:00');
    await order(10); // di luar jendela 7 hari pada saat menghitung
    at('2031-02-03T09:00');
    await order(70); // 1330 L, di dalam jendela
    const now = at('2031-02-09T08:00');

    const t = await tank();
    // pemakaian dalam 7 hari terakhir = 70 galon -> 10 galon (190 L) per hari
    assert.equal(t.remainingLiters, 6000 - 80 * 19);
    assert.equal(t.avgDailyGallons, 10);
    assert.equal(t.daysLeft, Math.round(((6000 - 80 * 19) / 190) * 10) / 10);
    const expectedEmpty = new Date(now.getTime() + ((6000 - 80 * 19) / 190) * 86400000);
    assert.equal(t.emptyOn, new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(expectedEmpty));
    assert.equal(t.level, 'OK');
  });

  it('peringatan LOW (< 3 hari) lalu CRITICAL (< 1 hari) mengikuti sisa hari', async () => {
    at('2031-02-20T08:00');
    await adjust(1000);
    at('2031-02-20T09:00');
    await order(45); // 855 L terpakai; 45 galon dalam 7 hari = 6,43 galon (122 L) per hari
    let t = await tank();
    assert.equal(t.remainingLiters, 1000 - 855);
    assert.equal(t.daysLeft, 1.2);
    assert.equal(t.level, 'LOW');

    at('2031-02-20T10:00');
    await order(4); // sisa 69 L; 49 galon / 7 hari = 7 galon (133 L) per hari -> 0,5 hari
    t = await tank();
    assert.equal(t.remainingLiters, 69);
    assert.equal(t.avgDailyGallons, 7);
    assert.equal(t.level, 'CRITICAL');
  });
});

describe('riwayat dan pembatalan', () => {
  it('riwayat memuat air masuk, koreksi, dan konsumsi; koreksi tidak bisa dibatalkan', async () => {
    at('2031-03-01T08:00');
    await adjust(4000);
    at('2031-03-01T09:00');
    const refill = (await post('/api/tank/refills', { liters: 700, note: 'truk air' })).json;
    const use = (await post('/api/personal-use', { gallons: 4 })).json;

    const hist = (await h.api('/api/tank/history', { cookie: h.pemilik })).json.items;
    const types = new Set(hist.map((i) => i.type));
    assert.deepEqual([...types].sort(), ['ADJUSTMENT', 'PERSONAL', 'REFILL']);
    assert.equal(hist.find((i) => i.type === 'REFILL' && i.id === refill.id).note, 'truk air');
    assert.equal(hist.find((i) => i.type === 'PERSONAL' && i.id === use.id).gallons, 4);
    assert.ok(hist.filter((i) => i.type === 'ADJUSTMENT').every((i) => i.canVoid === false));
    const times = hist.map((i) => new Date(i.at).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => b - a), 'terbaru di atas');
    assert.equal((await h.api('/api/tank/adjustments/1', { method: 'PATCH', cookie: h.admin, body: { voided: true } })).status, 404);
  });

  it('PEMILIK hanya membatalkan catatan hari ini; ADMIN kapan saja; sudah batal = 409', async () => {
    at('2031-03-05T09:00');
    const r1 = (await post('/api/tank/refills', { liters: 100 })).json;
    const r2 = (await post('/api/tank/refills', { liters: 200 })).json;
    at('2031-03-06T09:00');
    const denied = await h.api(`/api/tank/refills/${r1.id}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } });
    assert.equal(denied.status, 403);
    assert.equal(denied.json.error.code, 'VOID_NOT_ALLOWED');
    assert.equal((await h.api(`/api/tank/refills/${r1.id}`, { method: 'PATCH', cookie: h.admin, body: { voided: true } })).status, 200);
    assert.equal((await h.api(`/api/tank/refills/${r1.id}`, { method: 'PATCH', cookie: h.admin, body: { voided: true } })).status, 409);
    assert.equal((await h.api('/api/tank/refills/999999999', { method: 'PATCH', cookie: h.admin, body: { voided: true } })).status, 404);

    const mine = (await post('/api/tank/refills', { liters: 50 })).json;
    assert.equal((await h.api(`/api/tank/refills/${mine.id}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } })).status, 200);
    const hist = (await h.api('/api/tank/history', { cookie: h.pemilik })).json.items;
    const old = hist.find((i) => i.type === 'REFILL' && i.id === r2.id);
    assert.equal(old.canVoid, false, 'catatan kemarin tidak bisa dibatalkan pemilik');
  });

  it('pencatatan ganda dengan clientRequestId yang sama hanya sekali', async () => {
    at('2031-03-07T09:00');
    const body = { liters: 321, clientRequestId: crypto.randomUUID() };
    const [x, y] = await Promise.all([post('/api/tank/refills', body), post('/api/tank/refills', body)]);
    assert.deepEqual([x.status, y.status].sort(), [200, 201]);
    assert.equal(x.json.id, y.json.id);
    const hist = (await h.api('/api/tank/history', { cookie: h.pemilik })).json.items;
    assert.equal(hist.filter((i) => i.type === 'REFILL' && i.liters === 321).length, 1);
  });
});

describe('ringkasan Beranda', () => {
  it('memuat order hari ini, total utang, dan kondisi toren', async () => {
    at('2031-04-01T08:00');
    await adjust(2000);
    at('2031-04-01T09:00');
    await order(4); // 20.000
    const r = await h.api('/api/summary', { cookie: h.pemilik });
    assert.equal(r.status, 200);
    assert.equal(r.json.today, '2031-04-01');
    assert.deepEqual(r.json.orders, { orderCount: 1, gallons: 4, total: 20000 });
    assert.equal(typeof r.json.totalDebt, 'number');
    assert.equal(r.json.tank.remainingLiters, 2000 - 76);
  });
});
