// Tes auth dan pembatasan peran. Memakai database dari DATABASE_URL;
// akun uji (username awalan "tes_") dibuat dan dihapus sendiri.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.mjs';
import { createApp } from '../src/app.mjs';
import { pool } from '../src/db/pool.mjs';

if (env.isProduction) throw new Error('Tes tidak boleh dijalankan di produksi.');

const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'tomodachiqua' };
let server;
let base;

async function api(path, { method = 'GET', body, cookie, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...HEADERS, ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  const json = await res.json().catch(() => null);
  return { status: res.status, json, cookie: setCookie ? setCookie.split(';')[0] : null, setCookie };
}

before(async () => {
  const hash = await bcrypt.hash('sandi-uji-123', 10);
  await pool.query('DELETE FROM users WHERE username LIKE $1', ['tes\\_%']);
  await pool.query(
    `INSERT INTO users (name, username, password_hash, role, is_active) VALUES
     ('Admin Uji',   'tes_admin',   $1, 'ADMIN',   TRUE),
     ('Pemilik Uji', 'tes_pemilik', $1, 'PEMILIK', TRUE),
     ('Nonaktif',    'tes_off',     $1, 'PEMILIK', FALSE)`,
    [hash],
  );
  server = createApp({ loginMax: 100 }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await pool.query('DELETE FROM users WHERE username LIKE $1', ['tes\\_%']);
  await new Promise((r) => server.close(r));
  await pool.end();
});

describe('health', () => {
  it('GET /api/health dan /api/health/db', async () => {
    assert.equal((await api('/api/health')).status, 200);
    const db = await api('/api/health/db');
    assert.equal(db.status, 200);
    assert.equal(db.json.db, 'terhubung');
  });
});

describe('login', () => {
  it('berhasil dengan kredensial benar (username tidak peka huruf besar)', async () => {
    const r = await api('/api/auth/login', { method: 'POST', body: { username: 'TES_Admin', password: 'sandi-uji-123' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.user.role, 'ADMIN');
    assert.equal(r.json.user.password_hash, undefined);
    assert.match(r.setCookie, /HttpOnly/i);
  });

  it('gagal dengan password salah, username tak dikenal, dan akun nonaktif', async () => {
    for (const body of [
      { username: 'tes_admin', password: 'salah' },
      { username: 'tidak_ada', password: 'sandi-uji-123' },
      { username: 'tes_off', password: 'sandi-uji-123' },
    ]) {
      const r = await api('/api/auth/login', { method: 'POST', body });
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'INVALID_CREDENTIALS');
    }
  });

  it('menolak input kosong dengan 400', async () => {
    const r = await api('/api/auth/login', { method: 'POST', body: { username: '', password: '' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'VALIDATION_ERROR');
  });

  it('menolak permintaan POST tanpa header X-Requested-With', async () => {
    const r = await api('/api/auth/login', {
      method: 'POST',
      body: { username: 'tes_admin', password: 'sandi-uji-123' },
      headers: { 'X-Requested-With': '' },
    });
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'CSRF_BLOCKED');
  });
});

describe('sesi dan peran', () => {
  it('/me tanpa login -> 401', async () => {
    assert.equal((await api('/api/auth/me')).status, 401);
  });

  it('/me setelah login mengembalikan pengguna', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { username: 'tes_pemilik', password: 'sandi-uji-123' } });
    const me = await api('/api/auth/me', { cookie: login.cookie });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.username, 'tes_pemilik');
  });

  it('endpoint ADMIN: tanpa login 401, PEMILIK 403, ADMIN 200', async () => {
    assert.equal((await api('/api/admin/ping')).status, 401);

    const pemilik = await api('/api/auth/login', { method: 'POST', body: { username: 'tes_pemilik', password: 'sandi-uji-123' } });
    const denied = await api('/api/admin/ping', { cookie: pemilik.cookie });
    assert.equal(denied.status, 403);
    assert.equal(denied.json.error.code, 'FORBIDDEN');

    const admin = await api('/api/auth/login', { method: 'POST', body: { username: 'tes_admin', password: 'sandi-uji-123' } });
    const ok = await api('/api/admin/ping', { cookie: admin.cookie });
    assert.equal(ok.status, 200);
  });

  it('logout menghapus cookie; token lama dari akun yang dinonaktifkan ditolak', async () => {
    const login = await api('/api/auth/login', { method: 'POST', body: { username: 'tes_pemilik', password: 'sandi-uji-123' } });
    const out = await api('/api/auth/logout', { method: 'POST', cookie: login.cookie });
    assert.equal(out.status, 200);
    assert.match(out.setCookie, /tq_session=;/);

    await pool.query("UPDATE users SET is_active = FALSE WHERE username = 'tes_pemilik'");
    const me = await api('/api/auth/me', { cookie: login.cookie });
    assert.equal(me.status, 401);
    await pool.query("UPDATE users SET is_active = TRUE WHERE username = 'tes_pemilik'");
  });

  it('token palsu ditolak', async () => {
    const r = await api('/api/auth/me', { cookie: 'tq_session=abc.def.ghi' });
    assert.equal(r.status, 401);
  });
});

describe('rate limit login', () => {
  it('memblokir setelah terlalu banyak percobaan gagal', async () => {
    const limited = createApp({ loginMax: 3 }).listen(0);
    const url = `http://127.0.0.1:${limited.address().port}/api/auth/login`;
    const codes = [];
    for (let i = 0; i < 5; i++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ username: 'tes_admin', password: 'salah' }),
      });
      codes.push(res.status);
    }
    await new Promise((r) => limited.close(r));
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  });
});
