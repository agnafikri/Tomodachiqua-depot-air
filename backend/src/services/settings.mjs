import { query } from '../db/pool.mjs';
import { DEFAULT_PRICES } from './pricing.mjs';

// Harga standar dibaca dari tabel settings (bisa diubah tanpa mengubah kode).
export async function getPrices(db = { query }) {
  const { rows } = await db.query(
    "SELECT key, value FROM settings WHERE key IN ('price_pickup', 'price_delivery')",
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, Number.parseInt(r.value, 10)]));
  return {
    pickup: Number.isInteger(map.price_pickup) ? map.price_pickup : DEFAULT_PRICES.pickup,
    delivery: Number.isInteger(map.price_delivery) ? map.price_delivery : DEFAULT_PRICES.delivery,
  };
}

// Kapasitas toren dan isi per galon (liter). Nilai awal: 6000 L dan 19 L.
export async function getTankSettings(db = { query }) {
  const { rows } = await db.query(
    "SELECT key, value FROM settings WHERE key IN ('tank_capacity_liters', 'liters_per_gallon')",
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, Number.parseInt(r.value, 10)]));
  return {
    capacityLiters: Number.isInteger(map.tank_capacity_liters) ? map.tank_capacity_liters : 6000,
    litersPerGallon: Number.isInteger(map.liters_per_gallon) ? map.liters_per_gallon : 19,
  };
}
