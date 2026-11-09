// Tes murni untuk services/period.mjs (tanpa database).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, eachDay, resolvePeriod } from '../src/services/period.mjs';

const TODAY = '2026-11-08'; // hari Minggu

describe('addDays dan eachDay', () => {
  it('melewati batas bulan, tahun, dan tahun kabisat', () => {
    assert.equal(addDays('2026-11-30', 1), '2026-12-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2027-01-01', -1), '2026-12-31');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2027-02-28', 1), '2027-03-01');
  });
  it('eachDay inklusif', () => {
    assert.deepEqual(eachDay('2026-11-29', '2026-12-02'), ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    assert.deepEqual(eachDay('2026-11-08', '2026-11-08'), ['2026-11-08']);
  });
});

describe('periode harian', () => {
  it('satu hari; tombol berikutnya mati pada hari ini', () => {
    const r = resolvePeriod('daily', '2026-11-08', TODAY);
    assert.deepEqual([r.from, r.to], ['2026-11-08', '2026-11-08']);
    assert.equal(r.prevDate, '2026-11-07');
    assert.equal(r.nextDate, null);
    assert.equal(r.includesToday, true);
  });
  it('hari lampau punya tanggal berikutnya', () => {
    const r = resolvePeriod('daily', '2026-11-05', TODAY);
    assert.equal(r.nextDate, '2026-11-06');
    assert.equal(r.includesToday, false);
  });
});

describe('periode mingguan (Senin sampai Minggu)', () => {
  it('hari Minggu masuk minggu yang dimulai Senin sebelumnya', () => {
    const r = resolvePeriod('weekly', '2026-11-08', TODAY);
    assert.deepEqual([r.from, r.to], ['2026-11-02', '2026-11-08']);
    assert.equal(r.prevDate, '2026-10-26');
    assert.equal(r.nextDate, null, 'minggu depan belum dimulai');
    assert.equal(r.includesToday, true);
  });
  it('hari Senin memulai minggunya', () => {
    const r = resolvePeriod('weekly', '2026-11-09', '2026-11-20');
    assert.deepEqual([r.from, r.to], ['2026-11-09', '2026-11-15']);
    assert.equal(r.nextDate, '2026-11-16');
  });
  it('tengah minggu', () => {
    const r = resolvePeriod('weekly', '2026-11-04', TODAY);
    assert.deepEqual([r.from, r.to], ['2026-11-02', '2026-11-08']);
  });
  it('minggu melintasi pergantian tahun', () => {
    const r = resolvePeriod('weekly', '2026-12-31', '2027-02-01');
    assert.deepEqual([r.from, r.to], ['2026-12-28', '2027-01-03']);
    assert.equal(r.prevDate, '2026-12-21');
    assert.equal(r.nextDate, '2027-01-04');
  });
});

describe('periode bulanan', () => {
  it('satu bulan penuh; bulan berikutnya belum ada di bulan berjalan', () => {
    const r = resolvePeriod('monthly', '2026-11-15', TODAY);
    assert.deepEqual([r.from, r.to], ['2026-11-01', '2026-11-30']);
    assert.equal(r.prevDate, '2026-10-01');
    assert.equal(r.nextDate, null);
    assert.equal(r.includesToday, true);
  });
  it('bulan lampau punya bulan berikutnya', () => {
    const r = resolvePeriod('monthly', '2026-09-30', TODAY);
    assert.deepEqual([r.from, r.to], ['2026-09-01', '2026-09-30']);
    assert.equal(r.nextDate, '2026-10-01');
  });
  it('Februari: kabisat 29 hari, biasa 28 hari', () => {
    assert.equal(resolvePeriod('monthly', '2028-02-10', '2028-03-05').to, '2028-02-29');
    assert.equal(resolvePeriod('monthly', '2027-02-10', '2027-03-05').to, '2027-02-28');
  });
  it('Desember ke Januari dan sebaliknya (batas tahun)', () => {
    const dec = resolvePeriod('monthly', '2026-12-20', '2027-03-01');
    assert.deepEqual([dec.from, dec.to], ['2026-12-01', '2026-12-31']);
    assert.equal(dec.nextDate, '2027-01-01');
    assert.equal(resolvePeriod('monthly', '2027-01-05', '2027-03-01').prevDate, '2026-12-01');
  });
});

describe('periode tidak dikenal', () => {
  it('melempar galat', () => {
    assert.throws(() => resolvePeriod('yearly', '2026-11-08', TODAY));
  });
});
