// Tes permintaan layanan: endpoint publik (landing page) dan penanganannya di aplikasi.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.mjs';
import { pool } from '../src/db/pool.mjs';
import { createHarness } from './helpers.mjs';

let h;
before(async () => {
  h = await createHarness('srq');
});
after(async () => {
  await h.close();
});

const send = (body, extra = {}) => h.api('/api/public/service-requests', { method: 'POST', body, ...extra });
const valid = (over = {}) => ({ name: 'ZZTEST Bu Rina', phone: '0812 3456 7890', area: 'BANDUNG', serviceType: 'PASANG', address: 'Jl. Contoh No. 1, Coblong', message: 'Mau pasang depot baru.', ...over });
const rowsOf = async (name) => (await pool.query('SELECT * FROM service_requests WHERE name = $1 ORDER BY id', [name])).rows;

describe('endpoint publik', () => {
  it('menyimpan permintaan tanpa login; nomor dinormalkan; IP tidak disimpan mentah', async () => {
    const r = await send(valid({ name: 'ZZTEST Simpan' }));
    assert.equal(r.status, 201);
    assert.deepEqual(r.json, { ok: true });
    const [row] = await rowsOf('ZZTEST Simpan');
    assert.equal(row.phone, '6281234567890');
    assert.deepEqual([row.area, row.service_type, row.status], ['BANDUNG', 'PASANG', 'NEW']);
    assert.equal(row.address, 'Jl. Contoh No. 1, Coblong');
    assert.match(row.ip_hash, /^[0-9a-f]{16}$/);
    assert.ok(!JSON.stringify(row).includes('127.0.0.1'), 'IP asli tidak tersimpan');
  });

  it('alamat dan keterangan boleh kosong; teks dirapikan', async () => {
    const r = await send({ name: '  ZZTEST Minimal  ', phone: '+62 812 3456 7890', area: 'CIMAHI', serviceType: 'KONSULTASI', address: '   ', message: '' });
    assert.equal(r.status, 201);
    const [row] = await rowsOf('ZZTEST Minimal');
    assert.deepEqual([row.address, row.message, row.area, row.service_type], [null, null, 'CIMAHI', 'KONSULTASI']);
  });

  it('wajib memakai header X-Requested-With (formulir HTML polos ditolak)', async () => {
    const res = await fetch(`${h.base}/api/public/service-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid({ name: 'ZZTEST Tanpa Header' })) });
    assert.equal(res.status, 403);
    assert.equal((await rowsOf('ZZTEST Tanpa Header')).length, 0);
  });

  it('validasi: tiap kolom yang salah dilaporkan dengan pesan berbahasa Indonesia', async () => {
    const bad = [
      [{ name: 'A' }, 'name'],
      [{ name: 'x'.repeat(101) }, 'name'],
      [{ phone: '12345' }, 'phone'],
      [{ phone: '021 1234567' }, 'phone'],
      [{ phone: 'abc' }, 'phone'],
      [{ phone: undefined }, 'phone'],
      [{ area: 'JAKARTA' }, 'area'],
      [{ area: undefined }, 'area'],
      [{ serviceType: 'LAIN' }, 'serviceType'],
      [{ serviceType: undefined }, 'serviceType'],
      [{ address: 'x'.repeat(301) }, 'address'],
      [{ message: 'x'.repeat(1001) }, 'message'],
      [{ clientRequestId: 'bukan-uuid' }, 'clientRequestId'],
    ];
    for (const [over, field] of bad) {
      const r = await send(valid({ name: 'ZZTEST Valid', ...over }));
      assert.equal(r.status, 400, JSON.stringify(over));
      assert.ok(r.json.error.details.some((d) => d.field === field), `${JSON.stringify(over)} -> ${field}`);
    }
    assert.equal((await rowsOf('ZZTEST Valid')).length, 0, 'yang tidak valid tidak tersimpan');
    const phoneMsg = (await send(valid({ phone: '12345' }))).json.error.details.find((d) => d.field === 'phone').message;
    assert.match(phoneMsg, /nomor WhatsApp/i);
  });

  it('kolom jebakan terisi (bot): tampak berhasil tetapi tidak disimpan', async () => {
    const r = await send(valid({ name: 'ZZTEST Bot', website: 'http://spam.example' }));
    assert.equal(r.status, 201);
    assert.equal((await rowsOf('ZZTEST Bot')).length, 0);
  });

  it('kiriman ganda (clientRequestId sama, serentak) hanya tersimpan sekali', async () => {
    const body = valid({ name: 'ZZTEST Ganda', clientRequestId: crypto.randomUUID() });
    const [a, b] = await Promise.all([send(body), send(body)]);
    assert.deepEqual([a.status, b.status], [201, 201]);
    assert.equal((await rowsOf('ZZTEST Ganda')).length, 1);
  });

  it('batas kiriman per alamat IP: setelah batas, 429 dengan arahan ke WhatsApp', async () => {
    const limited = createApp({ publicMax: 3 }).listen(0);
    const url = `http://127.0.0.1:${limited.address().port}/api/public/service-requests`;
    const codes = [];
    let last;
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tomodachiqua' }, body: JSON.stringify(valid({ name: `ZZTEST Batas ${i}` })) });
      codes.push(res.status);
      last = await res.json();
    }
    await new Promise((r) => limited.close(r));
    assert.deepEqual(codes, [201, 201, 201, 429, 429]);
    assert.equal(last.error.code, 'TOO_MANY_REQUESTS');
    assert.match(last.error.message, /WhatsApp/);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM service_requests WHERE name LIKE 'ZZTEST Batas%'")).rows[0].n, 3);
  });
});

describe('di aplikasi (ADMIN dan PEMILIK)', () => {
  let ids;
  const mine = (list) => list.requests.filter((r) => r.name.startsWith('ZZTEST A-'));

  it('wajib login', async () => {
    assert.equal((await h.api('/api/service-requests')).status, 401);
    assert.equal((await h.api('/api/service-requests/1', { method: 'PATCH', body: { status: 'DONE' } })).status, 401);
    assert.equal((await h.api('/api/service-requests/1', { method: 'DELETE' })).status, 401);
  });

  it('daftar: terbaru di atas, jumlah per status, dan saringan status; kedua peran boleh', async () => {
    for (const n of [1, 2, 3]) assert.equal((await send(valid({ name: `ZZTEST A-${n}`, serviceType: n === 3 ? 'SERVICE' : 'PASANG' }))).status, 201);
    for (const cookie of [h.pemilik, h.admin]) {
      const r = await h.api('/api/service-requests', { cookie });
      assert.equal(r.status, 200);
      const list = mine(r.json);
      assert.deepEqual(list.map((x) => x.name), ['ZZTEST A-3', 'ZZTEST A-2', 'ZZTEST A-1']);
      assert.equal(list[0].serviceLabel, 'Service berkala');
      assert.equal(list[0].areaLabel, 'Kota Bandung');
      assert.equal(list[0].statusLabel, 'Baru');
      assert.equal(list[0].phone, '6281234567890');
      assert.ok(r.json.counts.NEW >= 3 && r.json.counts.total >= 3);
    }
    ids = mine((await h.api('/api/service-requests', { cookie: h.pemilik })).json).map((x) => x.id);
    assert.equal((await h.api('/api/service-requests?status=TIDAK_ADA', { cookie: h.pemilik })).status, 400);
    const onlyNew = (await h.api('/api/service-requests?status=NEW', { cookie: h.pemilik })).json;
    assert.ok(onlyNew.requests.every((x) => x.status === 'NEW'));
  });

  it('mengubah status dan catatan internal; waktu dihubungi dicatat sekali', async () => {
    const [id3, id2] = ids;
    const r1 = await h.api(`/api/service-requests/${id3}`, { method: 'PATCH', cookie: h.pemilik, body: { status: 'CONTACTED', internalNote: 'Sudah ditelepon, survei Sabtu' } });
    assert.equal(r1.status, 200);
    const a = r1.json.request;
    assert.deepEqual([a.status, a.internalNote, a.updatedByName], ['CONTACTED', 'Sudah ditelepon, survei Sabtu', 'Pemilik Uji']);
    assert.ok(a.contactedAt);

    const r2 = await h.api(`/api/service-requests/${id3}`, { method: 'PATCH', cookie: h.admin, body: { status: 'SURVEY' } });
    assert.equal(r2.json.request.contactedAt, a.contactedAt, 'waktu dihubungi pertama tidak berubah');
    assert.equal(r2.json.request.internalNote, 'Sudah ditelepon, survei Sabtu', 'catatan tidak hilang bila tidak dikirim');
    assert.equal(r2.json.request.updatedByName, 'Admin Uji');

    const note = await h.api(`/api/service-requests/${id2}`, { method: 'PATCH', cookie: h.admin, body: { internalNote: '  hanya catatan  ' } });
    assert.equal(note.json.request.status, 'NEW');
    assert.equal(note.json.request.contactedAt, null);
    assert.equal(note.json.request.internalNote, 'hanya catatan');
    const clear = await h.api(`/api/service-requests/${id2}`, { method: 'PATCH', cookie: h.admin, body: { internalNote: '' } });
    assert.equal(clear.json.request.internalNote, null);

    const survey = (await h.api('/api/service-requests?status=SURVEY', { cookie: h.pemilik })).json;
    assert.ok(survey.requests.some((x) => x.id === id3));
  });

  it('validasi perubahan', async () => {
    const [id] = ids;
    assert.equal((await h.api(`/api/service-requests/${id}`, { method: 'PATCH', cookie: h.admin, body: { status: 'NGAWUR' } })).status, 400);
    assert.equal((await h.api(`/api/service-requests/${id}`, { method: 'PATCH', cookie: h.admin, body: {} })).status, 400);
    assert.equal((await h.api(`/api/service-requests/${id}`, { method: 'PATCH', cookie: h.admin, body: { internalNote: 'x'.repeat(1001) } })).status, 400);
    assert.equal((await h.api('/api/service-requests/999999999', { method: 'PATCH', cookie: h.admin, body: { status: 'DONE' } })).status, 404);
  });

  it('jumlah permintaan baru muncul di ringkasan Beranda', async () => {
    const before = (await h.api('/api/summary', { cookie: h.pemilik })).json.serviceRequests.new;
    assert.equal((await send(valid({ name: 'ZZTEST A-baru' }))).status, 201);
    const after = (await h.api('/api/summary', { cookie: h.pemilik })).json.serviceRequests.new;
    assert.equal(after, before + 1);
  });

  it('hapus permanen: khusus ADMIN', async () => {
    const [id] = ids;
    const denied = await h.api(`/api/service-requests/${id}`, { method: 'DELETE', cookie: h.pemilik });
    assert.equal(denied.status, 403);
    assert.equal((await h.api(`/api/service-requests/${id}`, { method: 'DELETE', cookie: h.admin })).status, 200);
    assert.equal((await h.api(`/api/service-requests/${id}`, { method: 'DELETE', cookie: h.admin })).status, 404);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM service_requests WHERE id = $1', [id])).rows[0].n, 0);
  });
});
