import { AppError } from '../errors.mjs';

export const DEFAULT_PRICES = Object.freeze({ pickup: 5000, delivery: 6000 });
export const MAX_QTY = 1000;

export function calculateOrder({
  qty,
  isDelivered,
  customPrice = null,
  bundleBuy = null,
  bundlePay = null,
  prices = DEFAULT_PRICES,
}) {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
    throw new AppError(400, 'INVALID_QTY', `Jumlah galon harus bilangan bulat 1 sampai ${MAX_QTY}.`);
  }

  const hasCustom = customPrice != null;
  const unitPrice = hasCustom ? customPrice : isDelivered ? prices.delivery : prices.pickup;

  const hasBundle = bundleBuy != null && bundlePay != null;
  const freeQty = hasBundle ? Math.floor(qty / bundleBuy) * (bundleBuy - bundlePay) : 0;
  const paidQty = qty - freeQty;

  return {
    qty,
    unitPrice,
    paidQty,
    freeQty,
    total: paidQty * unitPrice,
    priceRule: hasCustom ? 'CUSTOM' : 'STANDARD',
    bundle: hasBundle && freeQty > 0 ? { buy: bundleBuy, pay: bundlePay } : null,
  };
}
