// Tes API pelanggan dan order (memakai database). Akun uji berawalan "ord_",
// pelanggan uji berawalan "ZZTEST"; semuanya dihapus lagi setelah tes.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.mjs';
import { createApp } from '../src/app.mjs';
import { pool } from '../src/db/pool.mjs';
import { setClock } from '../src/services/clock.mjs';

if (env.isProduction) throw new Error('Tes tidak boleh dijalankan di produksi.');

const PASS = 'sandi-uji-123';
let server;
let base;
let admin;
let pemilik;

async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tomodachiqua', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null), cookie: res.headers.get('set-cookie')?.split(';')[0] ?? null };
}

async function login(username) {
  const r = await api('/api/auth/login', { method: 'POST', body: { username, password: PASS } });
  return r.cookie;
}

async function cleanup() {
  await pool.query("DELETE FROM debt_waivers WHERE created_by IN (SELECT id FROM users WHERE username LIKE 'ord\\_%')");
  await pool.query("DELETE FROM payments WHERE created_by IN (SELECT id FROM users WHERE username LIKE 'ord\\_%')");
  await pool.query("DELETE FROM orders WHERE created_by IN (SELECT id FROM users WHERE username LIKE 'ord\\_%')");
  await pool.query("DELETE FROM customers WHERE name LIKE 'ZZTEST%'");
  await pool.query("DELETE FROM users WHERE username LIKE 'ord\\_%'");
}

before(async () => {
  await cleanup();
  const hash = await bcrypt.hash(PASS, 10);
  await pool.query(
    `INSERT INTO users (name, username, password_hash, role) VALUES
     ('Admin Uji', 'ord_admin', $1, 'ADMIN'), ('Pemilik Uji', 'ord_pemilik', $1, 'PEMILIK')`,
    [hash],
  );
  server = createApp({ loginMax: 100 }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await login('ord_admin');
  pemilik = await login('ord_pemilik');
});

after(async () => {
  await cleanup();
  await new Promise((r) => server.close(r));
  await pool.end();
});

async function newCustomer(suffix, extra = {}) {
  const r = await api('/api/customers', { method: 'POST', cookie: pemilik, body: { name: `ZZTEST ${suffix}`, ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.customer;
}

describe('akses', () => {
  it('semua endpoint wajib login', async () => {
    for (const [method, path] of [['GET', '/api/customers'], ['POST', '/api/customers'], ['GET', '/api/orders'], ['POST', '/api/orders'], ['POST', '/api/orders/preview']]) {
      assert.equal((await api(path, { method, body: method === 'POST' ? {} : undefined })).status, 401, `${method} ${path}`);
    }
  });
});

describe('pelanggan', () => {
  it('membuat, membaca, mengubah, dan menonaktifkan', async () => {
    const c = await newCustomer('Warung Bu Ani', { phone: '0812 3456', address: 'Pasar Baru', customPrice: 4500, bundleBuy: 10, bundlePay: 9 });
    assert.equal(c.customPrice, 4500);
    assert.equal(c.bundleBuy, 10);
    assert.equal(c.isActive, true);

    const list = await api('/api/customers?q=bu%20ani', { cookie: pemilik });
    assert.ok(list.json.customers.some((x) => x.id === c.id));

    const upd = await api(`/api/customers/${c.id}`, { method: 'PATCH', cookie: pemilik, body: { customPrice: 4000, bundleBuy: null, bundlePay: null } });
    assert.equal(upd.json.customer.customPrice, 4000);
    assert.equal(upd.json.customer.bundleBuy, null);

    await api(`/api/customers/${c.id}`, { method: 'PATCH', cookie: pemilik, body: { isActive: false } });
    const active = await api('/api/customers?q=ZZTEST', { cookie: pemilik });
    assert.ok(!active.json.customers.some((x) => x.id === c.id), 'nonaktif tidak muncul di daftar aktif');
    const all = await api('/api/customers?q=ZZTEST&active=all', { cookie: pemilik });
    assert.ok(all.json.customers.some((x) => x.id === c.id));
  });

  it('menolak nama kembar (tanpa membedakan huruf besar/kecil) dengan 409', async () => {
    await newCustomer('Kembar');
    const r = await api('/api/customers', { method: 'POST', cookie: pemilik, body: { name: 'zztest kembar' } });
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'DUPLICATE_NAME');
  });

  it('validasi: nama kosong, harga tidak valid, diskon paket tidak masuk akal', async () => {
    const bad = [
      [{ name: '  ' }, 'name'],
      [{ name: 'ZZTEST x', customPrice: 0 }, 'customPrice'],
      [{ name: 'ZZTEST x', customPrice: 4500.5 }, 'customPrice'],
      [{ name: 'ZZTEST x', bundleBuy: 10 }, 'bundlePay'],
      [{ name: 'ZZTEST x', bundleBuy: 10, bundlePay: 10 }, 'bundlePay'],
      [{ name: 'ZZTEST x', bundleBuy: 9, bundlePay: 10 }, 'bundlePay'],
    ];
    for (const [body, field] of bad) {
      const r = await api('/api/customers', { method: 'POST', cookie: pemilik, body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.json.error.details.some((d) => d.field === field), `${JSON.stringify(body)} -> ${field}`);
    }
  });

  it('PATCH pelanggan tidak ada = 404', async () => {
    const r = await api('/api/customers/999999999', { method: 'PATCH', cookie: pemilik, body: { name: 'ZZTEST nope' } });
    assert.equal(r.status, 404);
  });
});

describe('preview dan harga order', () => {
  it('pelanggan umum: harga standar diantar dan diambil', async () => {
    const a = await api('/api/orders/preview', { method: 'POST', cookie: pemilik, body: { customerId: null, qty: 4, isDelivered: true } });
    assert.equal(a.json.price.total, 24000);
    const b = await api('/api/orders/preview', { method: 'POST', cookie: pemilik, body: { customerId: null, qty: 4, isDelivered: false } });
    assert.equal(b.json.price.total, 20000);
  });

  it('pelanggan custom + paket: harga custom final, diskon dihitung', async () => {
    const c = await newCustomer('Warung Paket', { customPrice: 4500, bundleBuy: 10, bundlePay: 9 });
    for (const isDelivered of [true, false]) {
      const r = await api('/api/orders/preview', { method: 'POST', cookie: pemilik, body: { customerId: c.id, qty: 20, isDelivered } });
      assert.equal(r.json.price.unitPrice, 4500);
      assert.equal(r.json.price.freeQty, 2);
      assert.equal(r.json.price.total, 18 * 4500);
    }
  });

  it('menolak jumlah tidak valid, pelanggan tak ada, dan pelanggan nonaktif', async () => {
    assert.equal((await api('/api/orders/preview', { method: 'POST', cookie: pemilik, body: { customerId: null, qty: 0, isDelivered: true } })).status, 400);
    assert.equal((await api('/api/orders/preview', { method: 'POST', cookie: pemilik, body: { customerId: null, qty: 1.5, isDelivered: true } })).status, 400);
    assert.equal((await api('/api/orders/preview', { method: 'POST', cookie: pemilik, body: { customerId: 999999999, qty: 1, isDelivered: true } })).status, 404);
    const c = await newCustomer('Nonaktif');
    await api(`/api/customers/${c.id}`, { method: 'PATCH', cookie: pemilik, body: { isActive: false } });
    const r = await api('/api/orders/preview', { method: 'POST', cookie: pemilik, body: { customerId: c.id, qty: 1, isDelivered: true } });
    assert.equal(r.json.error.code, 'CUSTOMER_INACTIVE');
  });
});

describe('menyimpan order', () => {
  it('lunas membuat pembayaran sebesar total; harga tersimpan di baris order', async () => {
    const r = await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: null, qty: 3, isDelivered: true, payStatus: 'PAID' } });
    assert.equal(r.status, 201);
    const o = r.json.order;
    assert.equal(o.unitPrice, 6000);
    assert.equal(o.total, 18000);
    assert.equal(o.paymentStatus, 'PAID');
    assert.equal(o.paidAmount, 18000);
    const { rows } = await pool.query('SELECT amount FROM payments WHERE order_id = $1', [o.id]);
    assert.deepEqual(rows.map((x) => x.amount), [18000]);
  });

  it('utang: tidak ada pembayaran, status DEBT', async () => {
    const c = await newCustomer('Pengutang', { customPrice: 4500 });
    const r = await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: c.id, qty: 10, isDelivered: true, payStatus: 'DEBT', note: 'bayar Jumat' } });
    assert.equal(r.status, 201);
    assert.equal(r.json.order.total, 45000);
    assert.equal(r.json.order.paymentStatus, 'DEBT');
    assert.equal(r.json.order.paidAmount, 0);
    assert.equal(r.json.order.note, 'bayar Jumat');
    assert.equal(r.json.order.customerName, 'ZZTEST Pengutang');
  });

  it('utang untuk pelanggan umum boleh, tetapi catatan (siapa yang berutang) wajib', async () => {
    const tanpaCatatan = await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: null, qty: 2, isDelivered: false, payStatus: 'DEBT' } });
    assert.equal(tanpaCatatan.status, 400);
    assert.ok(tanpaCatatan.json.error.details.some((d) => d.field === 'note'));

    const spasi = await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: null, qty: 2, isDelivered: false, payStatus: 'DEBT', note: '   ' } });
    assert.equal(spasi.status, 400);

    const ok = await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: null, qty: 2, isDelivered: false, payStatus: 'DEBT', note: 'Pak Dedi RT 3' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.order.customerName, null);
    assert.equal(ok.json.order.paymentStatus, 'DEBT');
    assert.equal(ok.json.order.paidAmount, 0);
    assert.equal(ok.json.order.note, 'Pak Dedi RT 3');
    const pay = await pool.query('SELECT count(*)::int AS n FROM payments WHERE order_id = $1', [ok.json.order.id]);
    assert.equal(pay.rows[0].n, 0);
  });

  it('harga lama tidak berubah ketika harga pelanggan diubah kemudian', async () => {
    const c = await newCustomer('Harga Berubah', { customPrice: 4500 });
    const o = (await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: c.id, qty: 10, isDelivered: true, payStatus: 'DEBT' } })).json.order;
    await api(`/api/customers/${c.id}`, { method: 'PATCH', cookie: pemilik, body: { customPrice: 9999 } });
    const list = await api(`/api/orders?customerId=${c.id}`, { cookie: pemilik });
    const found = list.json.orders.find((x) => x.id === o.id);
    assert.equal(found.unitPrice, 4500);
    assert.equal(found.total, 45000);
  });

  it('permintaan ganda dengan clientRequestId yang sama hanya membuat satu order', async () => {
    const clientRequestId = crypto.randomUUID();
    const body = { customerId: null, qty: 2, isDelivered: false, payStatus: 'PAID', clientRequestId };
    const [a, b] = await Promise.all([
      api('/api/orders', { method: 'POST', cookie: pemilik, body }),
      api('/api/orders', { method: 'POST', cookie: pemilik, body }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 201]);
    assert.equal(a.json.order.id, b.json.order.id);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM orders WHERE client_request_id = $1', [clientRequestId]);
    assert.equal(rows[0].n, 1);
    const pay = await pool.query('SELECT count(*)::int AS n FROM payments WHERE order_id = $1', [a.json.order.id]);
    assert.equal(pay.rows[0].n, 1);
  });

  it('input tidak valid ditolak', async () => {
    for (const body of [
      { customerId: null, qty: 2, isDelivered: true },
      { customerId: null, qty: 2, isDelivered: true, payStatus: 'LAIN' },
      { customerId: null, qty: -2, isDelivered: true, payStatus: 'PAID' },
      { customerId: null, qty: 2, isDelivered: 'ya', payStatus: 'PAID' },
      { customerId: null, qty: 2, isDelivered: true, payStatus: 'PAID', clientRequestId: 'bukan-uuid' },
    ]) {
      assert.equal((await api('/api/orders', { method: 'POST', cookie: pemilik, body })).status, 400, JSON.stringify(body));
    }
  });
});

describe('daftar order dan pembatalan', () => {
  it('daftar hari ini memuat ringkasan; rentang tanggal dan filter pelanggan bekerja', async () => {
    const c = await newCustomer('Daftar');
    await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: c.id, qty: 5, isDelivered: true, payStatus: 'PAID' } });
    await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: c.id, qty: 3, isDelivered: true, payStatus: 'DEBT' } });

    const mine = await api(`/api/orders?customerId=${c.id}`, { cookie: pemilik });
    assert.equal(mine.json.orders.length, 2);
    assert.deepEqual(mine.json.summary, { orderCount: 2, gallons: 8, total: 48000, unpaid: 18000 });

    const longAgo = await api(`/api/orders?customerId=${c.id}&from=2000-01-01&to=2000-01-31`, { cookie: pemilik });
    assert.equal(longAgo.json.orders.length, 0);

    assert.equal((await api('/api/orders?from=2026-02-01&to=2026-01-01', { cookie: pemilik })).status, 400);
    assert.equal((await api('/api/orders?from=besok', { cookie: pemilik })).status, 400);
  });

  it('order pagi dan malam hari Jakarta masuk ke tanggal Jakarta yang benar', async () => {
    const c = await newCustomer('Zona Waktu');
    const o = (await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: c.id, qty: 1, isDelivered: false, payStatus: 'PAID' } })).json.order;
    // 23:30 WIB 10 Jan = 16:30 UTC 10 Jan; 00:10 WIB 11 Jan = 17:10 UTC 10 Jan
    await pool.query("UPDATE orders SET ordered_at = '2026-01-10T16:30:00Z' WHERE id = $1", [o.id]);
    const o2 = (await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: c.id, qty: 1, isDelivered: false, payStatus: 'PAID' } })).json.order;
    await pool.query("UPDATE orders SET ordered_at = '2026-01-10T17:10:00Z' WHERE id = $1", [o2.id]);

    const d10 = await api(`/api/orders?customerId=${c.id}&from=2026-01-10`, { cookie: pemilik });
    assert.deepEqual(d10.json.orders.map((x) => x.id), [o.id]);
    const d11 = await api(`/api/orders?customerId=${c.id}&from=2026-01-11`, { cookie: pemilik });
    assert.deepEqual(d11.json.orders.map((x) => x.id), [o2.id]);
  });

  it('PEMILIK membatalkan order hari ini: hilang dari daftar, pembayaran ikut batal', async () => {
    const o = (await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: null, qty: 2, isDelivered: true, payStatus: 'PAID' } })).json.order;
    const r = await api(`/api/orders/${o.id}`, { method: 'PATCH', cookie: pemilik, body: { voided: true } });
    assert.equal(r.status, 200);
    assert.ok(r.json.order.voidedAt);
    const list = await api('/api/orders', { cookie: pemilik });
    assert.ok(!list.json.orders.some((x) => x.id === o.id));
    const pay = await pool.query('SELECT voided_at FROM payments WHERE order_id = $1', [o.id]);
    assert.ok(pay.rows[0].voided_at);
    assert.equal((await api(`/api/orders/${o.id}`, { method: 'PATCH', cookie: pemilik, body: { voided: true } })).status, 409);
  });

  it('order hari sebelumnya: PEMILIK ditolak (403), ADMIN boleh', async () => {
    const o = (await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: null, qty: 1, isDelivered: true, payStatus: 'PAID' } })).json.order;
    await pool.query("UPDATE orders SET ordered_at = now() - interval '3 days' WHERE id = $1", [o.id]);
    const denied = await api(`/api/orders/${o.id}`, { method: 'PATCH', cookie: pemilik, body: { voided: true } });
    assert.equal(denied.status, 403);
    assert.equal(denied.json.error.code, 'VOID_NOT_ALLOWED');
    const ok = await api(`/api/orders/${o.id}`, { method: 'PATCH', cookie: admin, body: { voided: true } });
    assert.equal(ok.status, 200);
  });

  it('PATCH order hanya menerima {voided:true}; order tak ada = 404', async () => {
    assert.equal((await api('/api/orders/1', { method: 'PATCH', cookie: pemilik, body: { qty: 99 } })).status, 400);
    assert.equal((await api('/api/orders/999999999', { method: 'PATCH', cookie: pemilik, body: { voided: true } })).status, 404);
  });
});

describe('jam sistem dan pergantian hari (zona Jakarta)', () => {
  it('order mengikuti jam server: 23:59 WIB masuk tanggal itu, 00:01 WIB masuk tanggal berikutnya', async () => {
    const c = await newCustomer('Ganti Hari');
    try {
      setClock(() => new Date('2026-11-07T23:59:00+07:00'));
      const a = (await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: c.id, qty: 1, isDelivered: false, payStatus: 'PAID' } })).json.order;
      const listA = await api(`/api/orders?customerId=${c.id}`, { cookie: pemilik });
      assert.equal(listA.json.today, '2026-11-07');
      assert.deepEqual(listA.json.orders.map((x) => x.id), [a.id]);

      setClock(() => new Date('2026-11-08T00:01:00+07:00'));
      const listKosong = await api(`/api/orders?customerId=${c.id}`, { cookie: pemilik });
      assert.equal(listKosong.json.today, '2026-11-08');
      assert.deepEqual(listKosong.json.range, { from: '2026-11-08', to: '2026-11-08' });
      assert.equal(listKosong.json.orders.length, 0, 'hari baru dimulai kosong');

      const b = (await api('/api/orders', { method: 'POST', cookie: pemilik, body: { customerId: c.id, qty: 2, isDelivered: false, payStatus: 'PAID' } })).json.order;
      const day8 = await api(`/api/orders?customerId=${c.id}`, { cookie: pemilik });
      assert.deepEqual(day8.json.orders.map((x) => x.id), [b.id]);
      const day7 = await api(`/api/orders?customerId=${c.id}&from=2026-11-07`, { cookie: pemilik });
      assert.deepEqual(day7.json.orders.map((x) => x.id), [a.id]);

      // pembayaran lunas ikut bertanggal sama dengan order
      const pay = await pool.query("SELECT to_char(paid_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS d FROM payments WHERE order_id = $1", [b.id]);
      assert.equal(pay.rows[0].d, '2026-11-08');

      // order tanggal 7 sudah bukan "hari ini" lagi: PEMILIK tidak bisa membatalkan, ADMIN bisa
      const denied = await api(`/api/orders/${a.id}`, { method: 'PATCH', cookie: pemilik, body: { voided: true } });
      assert.equal(denied.status, 403);
      assert.equal((await api(`/api/orders/${b.id}`, { method: 'PATCH', cookie: pemilik, body: { voided: true } })).status, 200);
      assert.equal((await api(`/api/orders/${a.id}`, { method: 'PATCH', cookie: admin, body: { voided: true } })).status, 200);
    } finally {
      setClock();
    }
  });
});
