// Tes karyawan, upah harian, slip, dan hubungannya dengan Keuangan/Laporan (jam palsu tahun 2031).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { at, createHarness } from './helpers.mjs';

let h;
before(async () => {
  h = await createHarness('wgs');
});
after(async () => {
  await h.close();
});

const post = (path, body, cookie = h.pemilik) => h.api(path, { method: 'POST', cookie, body });
const get = (path, cookie = h.pemilik) => h.api(path, { cookie });
const patch = (path, body, cookie = h.pemilik) => h.api(path, { method: 'PATCH', cookie, body });
const newEmployee = async (name, extra = {}) => {
  const r = await post('/api/employees', { name: `ZZTEST wgs ${name}`, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.employee;
};
const pay = (date, items, extra = {}) => post('/api/wages', { wageDate: date, items, ...extra });

describe('akses', () => {
  it('wajib login', async () => {
    for (const path of ['/api/employees', '/api/wages', '/api/wages/slips', '/api/wages/slips/1']) {
      assert.equal((await h.api(path)).status, 401, path);
    }
    assert.equal((await h.api('/api/wages', { method: 'POST', body: {} })).status, 401);
  });
});

describe('karyawan', () => {
  it('membuat, mengubah, menonaktifkan; tanpa tarif tetap', async () => {
    const e = await newEmployee('Andi', { phone: '0812 111 222' });
    assert.equal(e.isActive, true);
    assert.equal(e.phone, '0812 111 222');
    assert.equal(e.dailyRate, undefined, 'tidak ada tarif harian');
    assert.equal(e.rate, undefined);

    const up = await patch(`/api/employees/${e.id}`, { phone: '' });
    assert.equal(up.json.employee.phone, null);
    await patch(`/api/employees/${e.id}`, { isActive: false });
    const all = (await get('/api/employees')).json.employees;
    assert.equal(all.find((x) => x.id === e.id).isActive, false);
    const active = (await get('/api/employees?active=true')).json.employees;
    assert.equal(active.find((x) => x.id === e.id), undefined);
  });

  it('validasi: nama kosong, kembar (tanpa peduli huruf besar-kecil), tidak ditemukan, tanpa perubahan', async () => {
    const r = await post('/api/employees', { name: '  ' });
    assert.equal(r.status, 400);
    assert.ok(r.json.error.details.some((d) => d.field === 'name'));
    await newEmployee('Kembar');
    const dup = await post('/api/employees', { name: 'zztest WGS kembar' });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.error.code, 'DUPLICATE_NAME');
    assert.equal((await patch('/api/employees/999999999', { name: 'ZZTEST wgs x' })).status, 404);
    const e = await newEmployee('Tanpa Ubah');
    assert.equal((await patch(`/api/employees/${e.id}`, {})).status, 400);
  });
});

describe('upah harian dan slip', () => {
  let budi;
  let sari;
  let slipBudi;
  let slipSari;

  it('layar "upah hari ini": acuan uang masuk, pengeluaran lain, dan karyawan aktif', async () => {
    budi = await newEmployee('Budi');
    sari = await newEmployee('Sari');
    at('2031-12-02T09:00');
    assert.equal((await post('/api/orders', { customerId: null, qty: 20, isDelivered: false, payStatus: 'PAID' })).status, 201); // 100.000
    assert.equal((await post('/api/expenses', { category: 'LISTRIK', amount: 20000 })).status, 201);

    const d = (await get('/api/wages')).json;
    assert.equal(d.date, '2031-12-02');
    assert.equal(d.today, '2031-12-02');
    assert.equal(d.cashIn, 100000);
    assert.equal(d.expenses, 20000);
    assert.equal(d.wagesPaid, 0);
    assert.equal(d.remaining, 80000);
    const mine = d.employees.filter((e) => [budi.id, sari.id].includes(e.id));
    assert.equal(mine.length, 2);
    assert.ok(mine.every((e) => e.slip === null));
  });

  it('simpan dan bayar beberapa karyawan sekaligus; nominal ditentukan pemilik', async () => {
    at('2031-12-02T17:00');
    const r = await pay('2031-12-02', [
      { employeeId: budi.id, amount: 20000, note: 'rajin, ramai hari ini' },
      { employeeId: sari.id, amount: 15000 },
    ], { clientRequestId: crypto.randomUUID() });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.slips.length, 2);
    slipBudi = r.json.slips.find((s) => s.employeeId === budi.id);
    slipSari = r.json.slips.find((s) => s.employeeId === sari.id);
    assert.equal(slipBudi.amount, 20000);
    assert.equal(slipBudi.note, 'rajin, ramai hari ini');
    assert.equal(slipBudi.wageDate, '2031-12-02');
    assert.equal(slipBudi.byName, 'Pemilik Uji');
    assert.equal(slipSari.note, null);

    const d = (await get('/api/wages?date=2031-12-02')).json;
    assert.equal(d.wagesPaid, 35000);
    assert.equal(d.remaining, 100000 - 20000 - 35000);
    assert.equal(d.employees.find((e) => e.id === budi.id).slip.amount, 20000);
    assert.equal(d.slips.length >= 2, true);
  });

  it('slip yang sama untuk tanggal yang sama ditolak; satu batch gagal = tidak ada yang tersimpan', async () => {
    const lain = await newEmployee('Lain');
    const r = await pay('2031-12-02', [{ employeeId: lain.id, amount: 10000 }, { employeeId: budi.id, amount: 5000 }]);
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'WAGE_EXISTS');
    assert.match(r.json.error.message, /Budi/);
    const d = (await get('/api/wages?date=2031-12-02')).json;
    assert.equal(d.employees.find((e) => e.id === lain.id).slip, null, 'Lain tidak ikut tersimpan');
  });

  it('permintaan ganda (clientRequestId sama, serentak) hanya membuat satu slip', async () => {
    const e = await newEmployee('Ganda');
    const body = { wageDate: '2031-12-02', items: [{ employeeId: e.id, amount: 12000 }], clientRequestId: crypto.randomUUID() };
    const [x, y] = await Promise.all([post('/api/wages', body), post('/api/wages', body)]);
    assert.deepEqual([x.status, y.status].sort(), [200, 201]);
    assert.equal(x.json.slips[0].id, y.json.slips[0].id);
    const d = (await get('/api/wages?date=2031-12-02')).json;
    assert.equal(d.slips.filter((s) => s.employeeId === e.id).length, 1);
  });

  it('validasi input', async () => {
    const e = await newEmployee('Validasi');
    const ok = { employeeId: e.id, amount: 10000 };
    const bad = [
      [{ items: [] }, 'items'],
      [{ items: [{ ...ok, amount: 0 }] }, 'items.0.amount'],
      [{ items: [{ ...ok, amount: -5 }] }, 'items.0.amount'],
      [{ items: [{ ...ok, amount: 10.5 }] }, 'items.0.amount'],
      [{ items: [{ ...ok, amount: 50_000_001 }] }, 'items.0.amount'],
      [{ items: [{ ...ok, employeeId: 'x' }] }, 'items.0.employeeId'],
      [{ items: [ok, ok] }, 'items'],
      [{ wageDate: '2031-12-03', items: [ok] }, 'wageDate'],
      [{ wageDate: '2031-02-30', items: [ok] }, 'wageDate'],
      [{ wageDate: 'kemarin', items: [ok] }, 'wageDate'],
      [{}, 'items'],
    ];
    for (const [body, field] of bad) {
      const r = await post('/api/wages', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.json.error.details.some((d) => d.field === field), `${JSON.stringify(body)} -> ${field}: ${JSON.stringify(r.json.error.details)}`);
    }
    assert.equal((await pay('2031-12-02', [{ employeeId: 999999999, amount: 1000 }])).status, 404);
    await patch(`/api/employees/${e.id}`, { isActive: false });
    const inactive = await pay('2031-12-02', [ok]);
    assert.equal(inactive.status, 400);
    assert.equal(inactive.json.error.code, 'EMPLOYEE_INACTIVE');
  });

  it('boleh tanggal lampau (lupa mencatat)', async () => {
    const e = await newEmployee('Lampau');
    const r = await pay('2031-12-01', [{ employeeId: e.id, amount: 30000 }]);
    assert.equal(r.status, 201);
    assert.equal(r.json.slips[0].wageDate, '2031-12-01');
    const d = (await get('/api/wages?date=2031-12-01')).json;
    assert.equal(d.employees.find((x) => x.id === e.id).slip.amount, 30000);
  });

  it('detail slip untuk dicetak; riwayat per periode dan per karyawan', async () => {
    const s = (await get(`/api/wages/slips/${slipBudi.id}`)).json.slip;
    assert.deepEqual(
      [s.employeeName, s.wageDate, s.amount, s.note, s.byName],
      ['ZZTEST wgs Budi', '2031-12-02', 20000, 'rajin, ramai hari ini', 'Pemilik Uji'],
    );
    assert.equal((await get('/api/wages/slips/999999999')).status, 404);

    const hist = (await get('/api/wages/slips?period=monthly&date=2031-12-02')).json;
    assert.deepEqual(hist.range, { from: '2031-12-01', to: '2031-12-31' });
    assert.equal(hist.slips.every((x) => x.canVoid === true), true, 'dibuat hari ini (jam palsu)');
    const onlyBudi = (await get(`/api/wages/slips?period=daily&date=2031-12-02&employeeId=${budi.id}`)).json;
    assert.deepEqual(onlyBudi.slips.map((x) => x.employeeId), [budi.id]);
    assert.equal(onlyBudi.total, 20000);
  });

  it('membatalkan: pemilik hanya slip yang dibuat hari ini; admin kapan saja; slip batal bisa dibuat ulang', async () => {
    at('2031-12-03T09:00'); // hari berikutnya
    const denied = await patch(`/api/wages/slips/${slipSari.id}`, { voided: true });
    assert.equal(denied.status, 403);
    assert.equal(denied.json.error.code, 'VOID_NOT_ALLOWED');
    assert.equal((await get('/api/wages/slips?period=daily&date=2031-12-02')).json.slips.find((x) => x.id === slipSari.id).canVoid, false);

    assert.equal((await patch(`/api/wages/slips/${slipSari.id}`, { voided: true }, h.admin)).status, 200);
    assert.equal((await patch(`/api/wages/slips/${slipSari.id}`, { voided: true }, h.admin)).status, 409);
    assert.equal((await get(`/api/wages/slips/${slipSari.id}`)).status, 404, 'slip batal tidak bisa dibuka');
    assert.equal((await patch('/api/wages/slips/999999999', { voided: true }, h.admin)).status, 404);
    assert.equal((await patch(`/api/wages/slips/${slipBudi.id}`, { amount: 5 })).status, 400);

    const again = await pay('2031-12-02', [{ employeeId: sari.id, amount: 18000 }]);
    assert.equal(again.status, 201, 'tanggal yang slipnya dibatalkan boleh dibuat ulang');

    // pemilik membatalkan slip yang ia buat hari ini
    const e = await newEmployee('Hari Ini');
    const mine = (await pay('2031-12-03', [{ employeeId: e.id, amount: 9000 }])).json.slips[0];
    assert.equal((await patch(`/api/wages/slips/${mine.id}`, { voided: true })).status, 200);
  });
});

describe('upah masuk ke Keuangan dan Laporan', () => {
  it('pengeluaran = manual + upah; kategori "Gaji dan upah"; rekap per karyawan; saldo', async () => {
    at('2031-12-04T09:00');
    // hari 2031-12-02: uang masuk 100.000, listrik 20.000, upah Budi 20.000 + Sari 18.000 (setelah dibuat ulang)
    const f = (await get('/api/finance?period=daily&date=2031-12-02')).json;
    assert.equal(f.income.total, 100000);
    assert.equal(f.expenses.total, 20000 + 20000 + 18000 + 12000); // listrik + Budi + Sari + Ganda (Rp 12.000)
    const upah = f.expenses.byCategory.find((c) => c.category === 'UPAH');
    assert.equal(upah.label, 'Gaji dan upah');
    assert.equal(upah.amount, 20000 + 18000 + 12000);
    assert.equal(f.expenses.byCategory.find((c) => c.category === 'LISTRIK').amount, 20000);
    assert.equal(f.wages.total, 50000);
    assert.deepEqual(f.wages.byEmployee.map((e) => [e.name, e.amount, e.days]), [
      ['ZZTEST wgs Budi', 20000, 1], ['ZZTEST wgs Sari', 18000, 1], ['ZZTEST wgs Ganda', 12000, 1],
    ]);
    assert.equal(f.balance, 100000 - 70000);
    assert.equal(f.categories.some((c) => c.code === 'UPAH'), false, 'upah tidak bisa dipilih sebagai pengeluaran manual');
    const pct = f.expenses.byCategory.reduce((s, c) => s + c.percent, 0);
    assert.ok(pct >= 99 && pct <= 101);
  });

  it('rekap per karyawan pada periode bulanan menjumlahkan slip harian (bukan gaji bulanan)', async () => {
    const f = (await get('/api/finance?period=monthly&date=2031-12-04')).json;
    const budi = f.wages.byEmployee.find((e) => e.name === 'ZZTEST wgs Budi');
    assert.equal(budi.amount, 20000);
    const lampau = f.wages.byEmployee.find((e) => e.name === 'ZZTEST wgs Lampau');
    assert.equal(lampau.amount, 30000);
    assert.equal(lampau.days, 1);
  });

  it('laporan: total upah, pengeluaran, dan rincian per hari menyertakan upah', async () => {
    const r = (await get('/api/reports?period=daily&date=2031-12-02')).json;
    assert.equal(r.totals.wages, 50000);
    assert.equal(r.totals.expenses, 70000);
    assert.equal(r.totals.balance, 100000 - 70000);
    const m = (await get('/api/reports?period=monthly&date=2031-12-04')).json;
    assert.equal(m.days.find((d) => d.date === '2031-12-02').expenses, 70000);
    assert.equal(m.days.find((d) => d.date === '2031-12-01').expenses, 30000, 'upah tanggal lampau masuk harinya');
    assert.equal(m.days.reduce((s, d) => s + d.expenses, 0), m.totals.expenses);
  });

  it('membatalkan slip mengurangi pengeluaran', async () => {
    const before = (await get('/api/finance?period=daily&date=2031-12-01')).json;
    assert.equal(before.wages.total, 30000);
    const slips = (await get('/api/wages/slips?period=daily&date=2031-12-01')).json.slips;
    assert.equal((await patch(`/api/wages/slips/${slips[0].id}`, { voided: true }, h.admin)).status, 200);
    const after = (await get('/api/finance?period=daily&date=2031-12-01')).json;
    assert.equal(after.wages.total, 0);
    assert.equal(after.expenses.total, 0);
  });

  it('upah tidak bisa dicatat sebagai pengeluaran manual (menghindari hitungan ganda)', async () => {
    const r = await post('/api/expenses', { category: 'UPAH', amount: 50000 });
    assert.equal(r.status, 400);
    const detail = r.json.error.details.find((d) => d.field === 'category');
    assert.match(detail.message, /menu Upah/);
    assert.equal((await post('/api/expenses', { category: 'NGAWUR', amount: 1000 })).status, 400);
  });
});
