import { query } from '../db/pool.mjs';
import { jakartaDate } from './clock.mjs';
import { getTotalDebt } from './debts.mjs';
import { getTankStatus } from './stock.mjs';

// Ringkasan untuk Beranda: order hari ini, total utang, dan kondisi toren.
export async function getSummary() {
  const today = jakartaDate();
  const [orders, totalDebt, tank] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS order_count, COALESCE(SUM(qty), 0)::int AS gallons, COALESCE(SUM(total), 0)::int AS total
       FROM orders
       WHERE voided_at IS NULL
         AND ordered_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Jakarta'
         AND ordered_at <  ($1::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta'`,
      [today],
    ),
    getTotalDebt(),
    getTankStatus(),
  ]);
  const o = orders.rows[0];
  return {
    today,
    orders: { orderCount: o.order_count, gallons: o.gallons, total: o.total },
    totalDebt,
    tank,
  };
}
