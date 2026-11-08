// Tes murni untuk services/pricing.mjs (tanpa database).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PRICES, calculateOrder } from '../src/services/pricing.mjs';

const calc = (o) => calculateOrder({ prices: DEFAULT_PRICES, ...o });

describe('harga standar', () => {
  it('diambil Rp 5.000 per galon', () => {
    const r = calc({ qty: 3, isDelivered: false });
    assert.equal(r.unitPrice, 5000);
    assert.equal(r.total, 15000);
    assert.equal(r.priceRule, 'STANDARD');
  });
  it('diantar Rp 6.000 per galon', () => {
    const r = calc({ qty: 3, isDelivered: true });
    assert.equal(r.unitPrice, 6000);
    assert.equal(r.total, 18000);
  });
  it('memakai harga dari settings yang diberikan', () => {
    const r = calculateOrder({ qty: 2, isDelivered: true, prices: { pickup: 5500, delivery: 6500 } });
    assert.equal(r.total, 13000);
  });
});

describe('harga custom (final, diantar maupun diambil)', () => {
  it('sama untuk diantar dan diambil, tanpa tambahan ongkos', () => {
    const antar = calc({ qty: 10, isDelivered: true, customPrice: 4500 });
    const ambil = calc({ qty: 10, isDelivered: false, customPrice: 4500 });
    assert.equal(antar.unitPrice, 4500);
    assert.equal(ambil.unitPrice, 4500);
    assert.equal(antar.total, 45000);
    assert.equal(ambil.total, 45000);
    assert.equal(antar.priceRule, 'CUSTOM');
  });
});

describe('diskon paket (beli X bayar Y)', () => {
  const bundle = { bundleBuy: 10, bundlePay: 9 };
  it('di bawah ambang tidak ada diskon', () => {
    const r = calc({ qty: 9, isDelivered: false, ...bundle });
    assert.equal(r.freeQty, 0);
    assert.equal(r.paidQty, 9);
    assert.equal(r.total, 45000);
    assert.equal(r.bundle, null);
  });
  it('tepat 10 galon bayar 9', () => {
    const r = calc({ qty: 10, isDelivered: false, ...bundle });
    assert.equal(r.freeQty, 1);
    assert.equal(r.paidQty, 9);
    assert.equal(r.total, 45000);
    assert.deepEqual(r.bundle, { buy: 10, pay: 9 });
  });
  it('kelipatan: 25 galon = 2 paket, gratis 2', () => {
    const r = calc({ qty: 25, isDelivered: false, ...bundle });
    assert.equal(r.freeQty, 2);
    assert.equal(r.paidQty, 23);
    assert.equal(r.total, 115000);
  });
  it('paket diskon lebih besar (beli 12 bayar 10)', () => {
    const r = calc({ qty: 24, isDelivered: true, bundleBuy: 12, bundlePay: 10 });
    assert.equal(r.freeQty, 4);
    assert.equal(r.paidQty, 20);
    assert.equal(r.total, 120000);
  });
  it('digabung harga custom: harga custom x galon dibayar', () => {
    const r = calc({ qty: 20, isDelivered: true, customPrice: 4500, ...bundle });
    assert.equal(r.paidQty, 18);
    assert.equal(r.unitPrice, 4500);
    assert.equal(r.total, 81000);
  });
  it('hanya satu sisi terisi dianggap tanpa diskon', () => {
    const r = calc({ qty: 20, isDelivered: false, bundleBuy: 10, bundlePay: null });
    assert.equal(r.freeQty, 0);
    assert.equal(r.total, 100000);
  });
});

describe('validasi jumlah', () => {
  for (const qty of [0, -1, 1.5, 1001, NaN, '5', null]) {
    it(`menolak qty ${String(qty)}`, () => {
      assert.throws(() => calc({ qty, isDelivered: false }), (e) => e.code === 'INVALID_QTY');
    });
  }
  it('menerima batas 1 dan 1000', () => {
    assert.equal(calc({ qty: 1, isDelivered: false }).total, 5000);
    assert.equal(calc({ qty: 1000, isDelivered: false }).total, 5_000_000);
  });
});
