// Tes utang dan pembayaran (database). Jam server dipalsukan agar urutan "order tertua" dan hari pasti.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db/pool.mjs';
import { at, createHarness } from './helpers.mjs';

let h;
const orderBody = (customerId, qty, extra = {}) => ({ customerId, qty, isDelivered: true, payStatus: 'DEBT', ...extra });

before(async () => {
  h = await createHarness('dbt');
});
after(async () => {
  await h.close();
});

async function makeOrder(body, cookie = h.pemilik) {
  const r = await h.api('/api/orders', { method: 'POST', cookie, body });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.order;
}
const debtOf = async (customerId) => (await h.api(`/api/debts/customers/${customerId}`, { cookie: h.pemilik })).json;
const listed = async (customerId) => (await h.api('/api/debts', { cookie: h.pemilik })).json.customers.find((c) => c.customerId === customerId);
const pay = (body, cookie = h.pemilik) => h.api('/api/payments', { method: 'POST', cookie, body });

describe('akses', () => {
  it('wajib login', async () => {
    assert.equal((await h.api('/api/debts')).status, 401);
    assert.equal((await h.api('/api/payments', { method: 'POST', body: {} })).status, 401);
    assert.equal((await h.api('/api/summary')).status, 401);
  });
});

describe('daftar utang dan alokasi pembayaran (order tertua dulu)', () => {
  let c;
  let a; let b; let o3;
  let firstBatch;
  let secondBatch;

  it('utang pelanggan = jumlah order yang belum dibayar', async () => {
    c = await h.newCustomer('Warung', { customPrice: 4500 });
    at('2031-02-01T09:00');
    a = await makeOrder(orderBody(c.id, 10)); // 45.000
    at('2031-02-01T10:00');
    b = await makeOrder(orderBody(c.id, 5)); // 22.500
    at('2031-02-01T11:00');
    o3 = await makeOrder(orderBody(c.id, 4)); // 18.000
    const row = await listed(c.id);
    assert.equal(row.outstanding, 85500);
    assert.equal(row.orderCount, 3);
    assert.equal(row.name, c.name);
  });

  it('order lunas tidak masuk daftar utang', async () => {
    at('2031-02-01T11:30');
    await makeOrder({ customerId: c.id, qty: 3, isDelivered: true, payStatus: 'PAID' });
    assert.equal((await listed(c.id)).outstanding, 85500);
  });

  it('bayar Rp 50.000: order A lunas, order B terbayar sebagian', async () => {
    at('2031-02-01T12:00');
    const r = await pay({ customerId: c.id, amount: 50000, clientRequestId: crypto.randomUUID() });
    assert.equal(r.status, 201);
    assert.deepEqual(r.json.payment.allocations, [{ orderId: a.id, amount: 45000 }, { orderId: b.id, amount: 5000 }]);
    assert.equal(r.json.payment.remainingDebt, 35500);
    firstBatch = r.json.payment.batchId;

    const d = await debtOf(c.id);
    assert.equal(d.outstanding, 35500);
    assert.deepEqual(d.orders.map((o) => [o.orderId, o.outstanding, o.paid]), [[b.id, 17500, 5000], [o3.id, 18000, 0]]);

    const list = await h.api(`/api/orders?customerId=${c.id}&from=2031-02-01`, { cookie: h.pemilik });
    const status = Object.fromEntries(list.json.orders.map((o) => [o.id, o.paymentStatus]));
    assert.equal(status[a.id], 'PAID');
    assert.equal(status[b.id], 'PARTIAL');
    assert.equal(status[o3.id], 'DEBT');
  });

  it('menolak jumlah tidak valid, melebihi utang, dan target ganda/kosong', async () => {
    const cases = [
      [{ customerId: c.id, amount: 0 }, 400],
      [{ customerId: c.id, amount: -5 }, 400],
      [{ customerId: c.id, amount: 10.5 }, 400],
      [{ customerId: c.id, amount: 35501 }, 400],
      [{ amount: 1000 }, 400],
      [{ customerId: c.id, orderId: b.id, amount: 1000 }, 400],
      [{ customerId: 999999999, amount: 1000 }, 404],
      [{ orderId: 999999999, amount: 1000 }, 404],
    ];
    for (const [body, status] of cases) {
      const r = await pay(body);
      assert.equal(r.status, status, JSON.stringify(body));
    }
    const over = await pay({ customerId: c.id, amount: 35501 });
    assert.equal(over.json.error.code, 'OVERPAY');
    assert.equal((await listed(c.id)).outstanding, 35500, 'penolakan tidak mengubah utang');
  });

  it('melunasi sisa: pelanggan keluar dari daftar; bayar lagi ditolak', async () => {
    at('2031-02-01T13:00');
    const r = await pay({ customerId: c.id, amount: 35500 });
    assert.equal(r.status, 201);
    secondBatch = r.json.payment.batchId;
    assert.equal(await listed(c.id), undefined);
    const again = await pay({ customerId: c.id, amount: 1000 });
    assert.equal(again.status, 400);
    assert.equal(again.json.error.code, 'NO_DEBT');
  });

  it('riwayat pembayaran: batch utang bisa dibatalkan, pembayaran saat order tidak', async () => {
    const d = await debtOf(c.id);
    const debtBatches = d.payments.filter((p) => p.source === 'DEBT');
    assert.deepEqual(debtBatches.map((p) => p.amount).sort((x, y) => x - y), [35500, 50000]);
    assert.ok(debtBatches.every((p) => p.canVoid));
    const atOrder = d.payments.find((p) => p.source === 'ORDER');
    assert.equal(atOrder.amount, 3 * 4500);
    assert.equal(atOrder.canVoid, false);
  });

  it('membatalkan pembayaran: utang kembali. PEMILIK hanya yang hari ini; ADMIN kapan saja', async () => {
    const same = await h.api(`/api/payments/${secondBatch}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } });
    assert.equal(same.status, 200);
    assert.equal((await listed(c.id)).outstanding, 35500);
    assert.equal((await h.api(`/api/payments/${secondBatch}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } })).status, 404, 'sudah batal');

    at('2031-02-02T09:00'); // hari berikutnya
    const denied = await h.api(`/api/payments/${firstBatch}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } });
    assert.equal(denied.status, 403);
    assert.equal(denied.json.error.code, 'VOID_NOT_ALLOWED');
    const ok = await h.api(`/api/payments/${firstBatch}`, { method: 'PATCH', cookie: h.admin, body: { voided: true } });
    assert.equal(ok.status, 200);
    assert.equal((await listed(c.id)).outstanding, 85500);
    assert.equal((await h.api(`/api/payments/bukan-uuid`, { method: 'PATCH', cookie: h.admin, body: { voided: true } })).status, 400);
  });
});

describe('keamanan data pembayaran', () => {
  it('permintaan ganda (clientRequestId sama, serentak) hanya tercatat sekali', async () => {
    at('2031-03-01T09:00');
    const c = await h.newCustomer('Ganda');
    await makeOrder(orderBody(c.id, 10, { isDelivered: false })); // 50.000
    const body = { customerId: c.id, amount: 20000, clientRequestId: crypto.randomUUID() };
    const [x, y] = await Promise.all([pay(body), pay(body)]);
    assert.deepEqual([x.status, y.status].sort(), [200, 201]);
    assert.equal(x.json.payment.batchId, y.json.payment.batchId);
    assert.equal((await listed(c.id)).outstanding, 30000, 'hanya terpotong sekali');
  });

  it('dua pembayaran serentak yang masing-masing melunasi: hanya satu yang berhasil', async () => {
    at('2031-03-01T10:00');
    const c = await h.newCustomer('Serentak');
    await makeOrder(orderBody(c.id, 2, { isDelivered: false })); // 10.000
    const [x, y] = await Promise.all([
      pay({ customerId: c.id, amount: 10000, clientRequestId: crypto.randomUUID() }),
      pay({ customerId: c.id, amount: 10000, clientRequestId: crypto.randomUUID() }),
    ]);
    assert.deepEqual([x.status, y.status].sort(), [201, 400]);
    const { rows } = await pool.query(
      'SELECT COALESCE(SUM(amount), 0)::int AS paid FROM payments WHERE customer_id = $1 AND voided_at IS NULL',
      [c.id],
    );
    assert.equal(rows[0].paid, 10000, 'total pembayaran tidak boleh melebihi utang');
  });

  it('membatalkan order ikut menghapus utangnya', async () => {
    at('2031-03-02T09:00');
    const c = await h.newCustomer('Order Batal');
    const o = await makeOrder(orderBody(c.id, 4));
    assert.equal((await listed(c.id)).outstanding, 24000);
    await h.api(`/api/orders/${o.id}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } });
    assert.equal(await listed(c.id), undefined);
  });

  it('utang pelanggan nonaktif tetap tercatat', async () => {
    at('2031-03-02T10:00');
    const c = await h.newCustomer('Nonaktif');
    await makeOrder(orderBody(c.id, 2));
    await h.api(`/api/customers/${c.id}`, { method: 'PATCH', cookie: h.pemilik, body: { isActive: false } });
    const row = await listed(c.id);
    assert.equal(row.outstanding, 12000);
    assert.equal(row.isActive, false);
  });
});

describe('utang pelanggan Umum (per order)', () => {
  it('tampil per order dengan catatannya, dibayar per order, tidak lewat customerId', async () => {
    at('2031-03-03T09:00');
    const o = await makeOrder({ customerId: null, qty: 3, isDelivered: true, payStatus: 'DEBT', note: 'Pak Dedi RT 3' }); // 18.000
    const find = async () => (await h.api('/api/debts', { cookie: h.pemilik })).json.umumOrders.find((x) => x.orderId === o.id);

    const row = await find();
    assert.equal(row.outstanding, 18000);
    assert.equal(row.note, 'Pak Dedi RT 3');

    const part = await pay({ orderId: o.id, amount: 10000 });
    assert.equal(part.status, 201);
    assert.equal(part.json.payment.remainingDebt, 8000);
    assert.equal((await find()).outstanding, 8000);

    assert.equal((await pay({ orderId: o.id, amount: 8001 })).status, 400);
    assert.equal((await pay({ orderId: o.id, amount: 8000 })).status, 201);
    assert.equal(await find(), undefined);
  });

  it('total utang = pelanggan + Umum', async () => {
    at('2031-03-04T09:00');
    const before = (await h.api('/api/debts', { cookie: h.pemilik })).json.totals;
    const c = await h.newCustomer('Total');
    await makeOrder(orderBody(c.id, 2)); // 12.000
    await makeOrder({ customerId: null, qty: 1, isDelivered: true, payStatus: 'DEBT', note: 'Bu Rini' }); // 6.000
    const after = (await h.api('/api/debts', { cookie: h.pemilik })).json.totals;
    assert.equal(after.customerTotal - before.customerTotal, 12000);
    assert.equal(after.umumTotal - before.umumTotal, 6000);
    assert.equal(after.total, after.customerTotal + after.umumTotal);
  });
});

describe('keringanan: kurang bayar dianggap lunas dengan catatan', () => {
  const waivers = (orderId) => pool.query('SELECT amount, note, voided_at FROM debt_waivers WHERE order_id = $1 ORDER BY id', [orderId]);
  const paidSum = async (orderId) =>
    (await pool.query('SELECT COALESCE(SUM(amount), 0)::int AS s FROM payments WHERE order_id = $1 AND voided_at IS NULL', [orderId])).rows[0].s;

  it('Umum: utang Rp 6.000, bayar Rp 5.000 + dianggap lunas: utang hilang, uang masuk tetap Rp 5.000', async () => {
    at('2031-05-01T09:00');
    const o = await makeOrder({ customerId: null, qty: 1, isDelivered: true, payStatus: 'DEBT', note: 'Bu Siti RT 2' }); // 6.000
    const r = await pay({ orderId: o.id, amount: 5000, waiveRemaining: true, note: 'Pelanggan hanya bawa Rp 5.000' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.payment.amount, 5000);
    assert.equal(r.json.payment.waived, 1000);
    assert.equal(r.json.payment.remainingDebt, 0);

    const umum = (await h.api('/api/debts', { cookie: h.pemilik })).json.umumOrders;
    assert.equal(umum.find((x) => x.orderId === o.id), undefined, 'tidak lagi tercatat sebagai utang');

    assert.equal(await paidSum(o.id), 5000, 'pendapatan = uang yang benar-benar diterima');
    const w = await waivers(o.id);
    assert.equal(w.rows.length, 1);
    assert.equal(w.rows[0].amount, 1000);
    assert.equal(w.rows[0].note, 'Pelanggan hanya bawa Rp 5.000');

    const list = await h.api('/api/orders?from=2031-05-01', { cookie: h.pemilik });
    const row = list.json.orders.find((x) => x.id === o.id);
    assert.equal(row.paymentStatus, 'PAID');
    assert.equal(row.paidAmount, 5000);
    assert.equal(row.waivedAmount, 1000);
    assert.equal(list.json.summary.unpaid, 0, 'ringkasan belum dibayar tidak menghitung yang diringankan');
  });

  it('Umum: utang Rp 12.000, bayar Rp 10.000 + dianggap lunas', async () => {
    at('2031-05-01T10:00');
    const o = await makeOrder({ customerId: null, qty: 2, isDelivered: true, payStatus: 'DEBT', note: 'Pak Anto' }); // 12.000
    const r = await pay({ orderId: o.id, amount: 10000, waiveRemaining: true, note: 'dibulatkan' });
    assert.equal(r.status, 201);
    assert.equal(r.json.payment.waived, 2000);
    assert.equal((await waivers(o.id)).rows[0].amount, 2000);
  });

  it('tanpa keringanan, kurang bayar tetap menyisakan utang (perilaku lama tidak berubah)', async () => {
    at('2031-05-01T11:00');
    const o = await makeOrder({ customerId: null, qty: 1, isDelivered: true, payStatus: 'DEBT', note: 'Bu Tati' });
    const r = await pay({ orderId: o.id, amount: 5000 });
    assert.equal(r.status, 201);
    assert.equal(r.json.payment.waived, 0);
    assert.equal(r.json.payment.remainingDebt, 1000);
    assert.equal((await waivers(o.id)).rows.length, 0);
    const umum = (await h.api('/api/debts', { cookie: h.pemilik })).json.umumOrders;
    assert.equal(umum.find((x) => x.orderId === o.id).outstanding, 1000);
  });

  it('keringanan wajib catatan (kosong atau spasi ditolak)', async () => {
    at('2031-05-01T12:00');
    const o = await makeOrder({ customerId: null, qty: 1, isDelivered: true, payStatus: 'DEBT', note: 'Pak Eko' });
    for (const note of [undefined, '', '   ']) {
      const r = await pay({ orderId: o.id, amount: 5000, waiveRemaining: true, ...(note === undefined ? {} : { note }) });
      assert.equal(r.status, 400, `note=${JSON.stringify(note)}`);
      assert.ok(r.json.error.details.some((d) => d.field === 'note'));
    }
    assert.equal(await paidSum(o.id), 0, 'penolakan tidak mencatat pembayaran apa pun');
  });

  it('bayar pas sama dengan utang: tidak ada keringanan yang tercatat', async () => {
    at('2031-05-01T13:00');
    const o = await makeOrder({ customerId: null, qty: 1, isDelivered: true, payStatus: 'DEBT', note: 'Bu Lilis' });
    const r = await pay({ orderId: o.id, amount: 6000, waiveRemaining: true, note: 'tidak perlu' });
    assert.equal(r.status, 201);
    assert.equal(r.json.payment.waived, 0);
    assert.equal((await waivers(o.id)).rows.length, 0);
  });

  it('jumlah bayar tetap harus ada dan tidak boleh melebihi utang walau ada keringanan', async () => {
    at('2031-05-01T14:00');
    const o = await makeOrder({ customerId: null, qty: 1, isDelivered: true, payStatus: 'DEBT', note: 'Pak Joko' });
    assert.equal((await pay({ orderId: o.id, amount: 0, waiveRemaining: true, note: 'x' })).status, 400);
    assert.equal((await pay({ orderId: o.id, amount: 6001, waiveRemaining: true, note: 'x' })).status, 400);
  });

  it('pelanggan bernama: sisa seluruh utangnya dianggap lunas (order tertua dibayar dulu, sisanya diringankan)', async () => {
    at('2031-05-02T09:00');
    const c = await h.newCustomer('Keringanan', { customPrice: 4500 });
    const a = await makeOrder(orderBody(c.id, 10)); // 45.000
    at('2031-05-02T10:00');
    const b = await makeOrder(orderBody(c.id, 5)); // 22.500
    at('2031-05-02T11:00');
    const o3 = await makeOrder(orderBody(c.id, 4)); // 18.000
    at('2031-05-02T12:00');
    const r = await pay({ customerId: c.id, amount: 50000, waiveRemaining: true, note: 'sepakat Rp 50.000 lunas', clientRequestId: crypto.randomUUID() });
    assert.equal(r.status, 201);
    assert.equal(r.json.payment.waived, 35500);
    assert.equal(r.json.payment.remainingDebt, 0);
    assert.equal(await listed(c.id), undefined);

    assert.equal(await paidSum(a.id), 45000);
    assert.equal(await paidSum(b.id), 5000);
    assert.equal(await paidSum(o3.id), 0);
    assert.equal((await waivers(a.id)).rows.length, 0);
    assert.equal((await waivers(b.id)).rows[0].amount, 17500);
    assert.equal((await waivers(o3.id)).rows[0].amount, 18000);

    const d = await debtOf(c.id);
    assert.equal(d.outstanding, 0);
    const batch = d.payments.find((p) => p.source === 'DEBT');
    assert.equal(batch.amount, 50000);
    assert.equal(batch.waived, 35500);
    assert.equal(batch.waiverNote, 'sepakat Rp 50.000 lunas');
  });

  it('membatalkan pembayaran ikut membatalkan keringanannya: utang kembali penuh', async () => {
    at('2031-05-03T09:00');
    const c = await h.newCustomer('Batal Keringanan');
    await makeOrder(orderBody(c.id, 2, { isDelivered: false })); // 10.000
    const r = await pay({ customerId: c.id, amount: 8000, waiveRemaining: true, note: 'kurang 2.000 dimaafkan' });
    assert.equal(await listed(c.id), undefined);

    const v = await h.api(`/api/payments/${r.json.payment.batchId}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } });
    assert.equal(v.status, 200);
    assert.equal((await listed(c.id)).outstanding, 10000);
    const w = await pool.query('SELECT voided_at FROM debt_waivers WHERE batch_id = $1', [r.json.payment.batchId]);
    assert.ok(w.rows[0].voided_at);
  });

  it('membatalkan order ikut membatalkan keringanannya', async () => {
    at('2031-05-03T10:00');
    const o = await makeOrder({ customerId: null, qty: 1, isDelivered: true, payStatus: 'DEBT', note: 'Pak Rudi' });
    await pay({ orderId: o.id, amount: 5000, waiveRemaining: true, note: 'dimaafkan' });
    assert.equal((await h.api(`/api/orders/${o.id}`, { method: 'PATCH', cookie: h.pemilik, body: { voided: true } })).status, 200);
    assert.ok((await waivers(o.id)).rows[0].voided_at);
  });

  it('permintaan ganda dengan keringanan hanya tercatat sekali', async () => {
    at('2031-05-04T09:00');
    const o = await makeOrder({ customerId: null, qty: 1, isDelivered: true, payStatus: 'DEBT', note: 'Bu Nani' });
    const body = { orderId: o.id, amount: 5000, waiveRemaining: true, note: 'dimaafkan', clientRequestId: crypto.randomUUID() };
    const [x, y] = await Promise.all([pay(body), pay(body)]);
    assert.deepEqual([x.status, y.status].sort(), [200, 201]);
    assert.equal((await waivers(o.id)).rows.length, 1);
    assert.equal(await paidSum(o.id), 5000);
  });
});
