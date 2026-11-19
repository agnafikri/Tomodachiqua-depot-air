// Tes murni untuk normalisasi nomor WhatsApp.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizePhone } from '../src/services/phone.mjs';

describe('normalizePhone', () => {
  it('berbagai penulisan nomor seluler menjadi 628xxxxxxxxxx', () => {
    for (const input of ['0812 3456 7890', '+62 812-3456-7890', '6281234567890', '812 3456 7890', '(0812) 3456 7890', '0812.3456.7890', ' 081234567890 ']) {
      assert.equal(normalizePhone(input), '6281234567890', input);
    }
  });
  it('panjang yang wajar diterima (10 sampai 13 digit setelah 0)', () => {
    assert.equal(normalizePhone('08123456789'), '628123456789');
    assert.equal(normalizePhone('0851234567890'), '62851234567890');
  });
  it('bukan nomor seluler Indonesia ditolak', () => {
    for (const bad of ['', null, undefined, '12345', '021 1234567', '0912345678', 'abc', '08', '0812', '081234567890123456', '+1 415 555 0100', '0812 3456 78x0']) {
      assert.equal(normalizePhone(bad), null, String(bad));
    }
  });
});
