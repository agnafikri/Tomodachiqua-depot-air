// Tes murni untuk pembacaan sel Excel (tanpa database).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as cell from '../src/services/excel/cells.mjs';

const val = (r) => (r.ok ? r.value : `GALAT: ${r.message}`);

describe('cellValue', () => {
  it('rumus memakai hasilnya; teks kaya digabung; objek tautan memakai teksnya', () => {
    assert.equal(cell.cellValue({ formula: 'A1*2', result: 9000 }), 9000);
    assert.equal(cell.cellValue({ richText: [{ text: 'Warung ' }, { text: 'Bu Ani' }] }), 'Warung Bu Ani');
    assert.equal(cell.cellValue({ text: 'Budi', hyperlink: 'x' }), 'Budi');
    assert.equal(cell.cellValue('  spasi  '), 'spasi');
    assert.equal(cell.cellValue(null), null);
    assert.equal(cell.cellValue({ error: '#REF!' }), null);
  });
});

describe('integer (uang dan jumlah)', () => {
  it('menerima angka dan teks berformat rupiah Indonesia', () => {
    for (const [input, want] of [[4500, 4500], ['4500', 4500], ['4.500', 4500], ['Rp 4.500', 4500], ['Rp. 1.000.000', 1000000], [' 12 ', 12], [0, 0]]) {
      assert.equal(val(cell.integer(input)), want, String(input));
    }
  });
  it('kosong = null; desimal dan teks lain ditolak', () => {
    assert.equal(val(cell.integer('')), null);
    assert.equal(val(cell.integer(null)), null);
    for (const bad of [4500.5, '12,5', 'abc', '4.500,50', '-5', 'Rp']) assert.match(val(cell.integer(bad)), /^GALAT/, String(bad));
  });
});

describe('date', () => {
  it('format ISO, hari-bulan-tahun, sel tanggal, dan serial Excel', () => {
    assert.equal(val(cell.date('2026-11-08')), '2026-11-08');
    assert.equal(val(cell.date('08/11/2026')), '2026-11-08');
    assert.equal(val(cell.date('8-11-2026')), '2026-11-08');
    assert.equal(val(cell.date('8.11.2026')), '2026-11-08');
    assert.equal(val(cell.date(new Date('2026-11-08T00:00:00Z'))), '2026-11-08');
    const serial = Date.UTC(2026, 10, 8) / 86400000 + 25569;
    assert.equal(val(cell.date(serial)), '2026-11-08');
  });
  it('tanggal yang tidak ada di kalender atau bukan tanggal ditolak', () => {
    for (const bad of ['2026-02-30', '32/01/2026', '2026-13-01', 'kemarin', '11/08', new Date('x')]) assert.match(val(cell.date(bad)), /^GALAT/, String(bad));
    assert.equal(val(cell.date('')), null);
  });
});

describe('time', () => {
  it('HH:MM, HH.MM, pecahan hari, dan sel jam', () => {
    assert.equal(val(cell.time('09:30')), '09:30');
    assert.equal(val(cell.time('9.30')), '09:30');
    assert.equal(val(cell.time(0.5)), '12:00');
    assert.equal(val(cell.time(0.3958333333)), '09:30');
    assert.equal(val(cell.time(new Date('1899-12-30T14:05:00Z'))), '14:05');
    assert.equal(val(cell.time('')), null);
  });
  it('jam tidak valid ditolak', () => {
    for (const bad of ['24:00', '12:60', 'siang', '1230']) assert.match(val(cell.time(bad)), /^GALAT/, bad);
  });
});

describe('yesNo', () => {
  it('berbagai penulisan Ya dan Tidak', () => {
    for (const y of ['Ya', 'ya', 'Y', 'iya', 'yes', 'TRUE', '1', true]) assert.equal(val(cell.yesNo(y)), true, String(y));
    for (const n of ['Tidak', 'tidak', 'T', 'no', 'N', 'false', '0', false]) assert.equal(val(cell.yesNo(n)), false, String(n));
  });
  it('kosong = undefined; lainnya ditolak', () => {
    assert.equal(val(cell.yesNo('')), undefined);
    assert.match(val(cell.yesNo('mungkin')), /^GALAT/);
  });
});

describe('text dan normalizeHeader', () => {
  it('batas panjang dan judul kolom tidak peka huruf/spasi', () => {
    assert.equal(val(cell.text('  Halo  ')), 'Halo');
    assert.equal(val(cell.text('')), null);
    assert.match(val(cell.text('x'.repeat(201))), /^GALAT/);
    assert.equal(cell.normalizeHeader('  Jumlah   GALON '), 'jumlah galon');
  });
});
