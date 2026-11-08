// Tes murni untuk calculateStock (tanpa database).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateStock } from '../src/services/stock.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2031-03-10T08:00:00+07:00');
const base = { capacityLiters: 6000, litersPerGallon: 19, at: NOW };
const adj = (litersAfter) => ({ litersAfter, adjustedAt: new Date(NOW.getTime() - 5 * DAY) });
const calc = (o) => calculateStock({ ...base, ...o });

describe('stok toren: sisa air', () => {
  it('tanpa koreksi stok: belum diketahui, perlu koreksi awal', () => {
    const r = calc({ adjustment: null, gallonsSince: 50 });
    assert.equal(r.known, false);
    assert.equal(r.status, 'NEEDS_ADJUSTMENT');
    assert.equal(r.remainingLiters, undefined);
  });

  it('koreksi saja: sisa = angka koreksi, persen dan setara galon benar', () => {
    const r = calc({ adjustment: adj(5000) });
    assert.equal(r.remainingLiters, 5000);
    assert.equal(r.percent, 83);
    assert.equal(r.gallonsLeft, 263); // floor(5000 / 19)
    assert.equal(r.status, 'OK');
    assert.equal(r.daysLeft, null, 'tanpa pemakaian tidak ada perkiraan');
    assert.equal(r.level, 'OK');
  });

  it('sisa = koreksi + air masuk - galon terpakai x 19', () => {
    const r = calc({ adjustment: adj(5000), refillLitersSince: 1000, gallonsSince: 10 });
    assert.equal(r.remainingLiters, 5000 + 1000 - 190);
  });

  it('sisa tepat nol: kritis, perkiraan 0 hari', () => {
    const r = calc({ adjustment: adj(190), gallonsSince: 10, recentGallons: 10, firstUsageAt: new Date(NOW - 10 * DAY) });
    assert.equal(r.remainingLiters, 0);
    assert.equal(r.level, 'CRITICAL');
    assert.equal(r.daysLeft, 0);
    assert.equal(r.gallonsLeft, 0);
  });

  it('pemakaian melebihi stok tercatat: NEGATIVE, ditampilkan 0 persen, perlu koreksi', () => {
    const r = calc({ adjustment: adj(100), gallonsSince: 20 });
    assert.equal(r.remainingLiters, 100 - 380);
    assert.equal(r.status, 'NEGATIVE');
    assert.equal(r.percent, 0);
    assert.equal(r.level, 'CRITICAL');
    assert.equal(r.gallonsLeft, 0);
  });

  it('melebihi kapasitas: OVER_CAPACITY, persen dibatasi 100', () => {
    const r = calc({ adjustment: adj(5900), refillLitersSince: 500 });
    assert.equal(r.status, 'OVER_CAPACITY');
    assert.equal(r.percent, 100);
  });
});

describe('stok toren: perkiraan habis', () => {
  it('rata-rata 7 hari penuh: 70 galon / 7 hari = 10 galon (190 L) per hari', () => {
    const r = calc({ adjustment: adj(1900), recentGallons: 70, firstUsageAt: new Date(NOW - 30 * DAY) });
    assert.equal(r.avgDailyGallons, 10);
    assert.equal(r.daysLeft, 10);
    assert.equal(r.emptyOn, '2031-03-20');
  });

  it('data baru 2 hari: dibagi 2 hari, bukan 7', () => {
    const r = calc({ adjustment: adj(3800), recentGallons: 40, firstUsageAt: new Date(NOW - 2 * DAY) });
    assert.equal(r.avgDailyGallons, 20);
    assert.equal(r.daysLeft, 10); // 3800 / (20 x 19)
  });

  it('data baru beberapa jam: dibagi minimal 1 hari', () => {
    const r = calc({ adjustment: adj(1900), recentGallons: 5, firstUsageAt: new Date(NOW - 3 * 60 * 60 * 1000) });
    assert.equal(r.avgDailyGallons, 5);
    assert.equal(r.daysLeft, 20);
  });

  it('tidak ada pemakaian 7 hari terakhir: tanpa perkiraan', () => {
    const r = calc({ adjustment: adj(1000), recentGallons: 0, firstUsageAt: new Date(NOW - 30 * DAY) });
    assert.equal(r.daysLeft, null);
    assert.equal(r.emptyOn, null);
    assert.equal(r.level, 'OK');
  });
});

describe('stok toren: tingkat peringatan', () => {
  // 10 galon (190 L) per hari; sisa diatur supaya perkiraan habis = X hari
  const withDays = (days) => calc({ adjustment: adj(Math.round(days * 190)), recentGallons: 70, firstUsageAt: new Date(NOW - 30 * DAY) });
  it('di atas 3 hari: OK', () => assert.equal(withDays(5).level, 'OK'));
  it('tepat 3 hari: masih OK (batas "kurang dari 3")', () => assert.equal(withDays(3).level, 'OK'));
  it('2,5 hari: LOW (oranye)', () => assert.equal(withDays(2.5).level, 'LOW'));
  it('tepat 1 hari: masih LOW (batas "kurang dari 1")', () => assert.equal(withDays(1).level, 'LOW'));
  it('0,5 hari: CRITICAL (merah)', () => assert.equal(withDays(0.5).level, 'CRITICAL'));
});
