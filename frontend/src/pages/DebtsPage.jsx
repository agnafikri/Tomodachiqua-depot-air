import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Search } from 'lucide-react';
import PaymentForm from '../components/PaymentForm.jsx';
import { Badge, Button, Card, Notice, PageHeader, Sheet } from '../components/ui.jsx';
import { api } from '../lib/api.mjs';
import { formatDate, formatDateTime, formatRupiah } from '../lib/format.mjs';

const shortDate = (v) => formatDate(v, { day: 'numeric', month: 'short' });

export default function DebtsPage() {
  const debts = useQuery({ queryKey: ['debts'], queryFn: () => api.get('/api/debts') });
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [umumOrder, setUmumOrder] = useState(null);

  const data = debts.data;
  const q = search.trim().toLowerCase();
  const customers = (data?.customers ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q));
  const umum = (data?.umumOrders ?? []).filter((o) => !q || (o.note ?? '').toLowerCase().includes(q));

  return (
    <>
      <PageHeader title="Utang" />

      {debts.isPending && <p className="text-muted">Memuat…</p>}
      {debts.isError && <Notice tone="error">{debts.error.message}</Notice>}

      {data && (
        <>
          <Card className="mb-4 bg-brand-soft">
            <p className="text-sm font-semibold text-brand-dark">Total utang</p>
            <p className="text-4xl font-extrabold tracking-tight text-brand-deep">{formatRupiah(data.totals.total)}</p>
            <p className="mt-1 text-sm text-brand-dark">
              {data.customers.length} pelanggan
              {data.umumOrders.length > 0 && ` · ${data.umumOrders.length} order umum`}
            </p>
          </Card>

          {data.customers.length + data.umumOrders.length === 0 && (
            <Card className="flex items-center gap-3">
              <CircleCheck className="size-6 shrink-0 text-ok" aria-hidden="true" />
              <p className="font-semibold text-ink">Tidak ada utang. Semua order sudah lunas.</p>
            </Card>
          )}

          {data.customers.length + data.umumOrders.length > 5 && (
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                aria-label="Cari utang"
                placeholder="Cari nama atau catatan"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block min-h-12 w-full rounded-xl border border-line bg-white pr-4 pl-12 text-base"
              />
            </div>
          )}

          {customers.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {customers.map((c) => (
                <li key={c.customerId}>
                  <button onClick={() => setCustomerId(c.customerId)} className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-soft">
                    <span className="min-w-0">
                      <span className="block truncate text-base font-bold text-ink">{c.name}</span>
                      <span className="block text-sm text-muted">
                        {c.orderCount} order · sejak {shortDate(c.oldestAt)}
                      </span>
                    </span>
                    <span className="shrink-0 text-base font-extrabold text-danger">{formatRupiah(c.outstanding)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {umum.length > 0 && (
            <section className="mt-6" aria-labelledby="umum-title">
              <h2 id="umum-title" className="mb-1 text-lg font-extrabold text-ink">
                Pelanggan umum
              </h2>
              <p className="mb-3 text-sm text-muted">Tanpa nama, jadi dibayar per order.</p>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                {umum.map((o) => (
                  <li key={o.orderId} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-ink">{o.note || 'Tanpa catatan'}</p>
                      <p className="text-sm text-muted">
                        {shortDate(o.orderedAt)} · {o.qty} galon
                        {o.paid > 0 && ` · sudah dibayar ${formatRupiah(o.paid)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-extrabold text-danger">{formatRupiah(o.outstanding)}</p>
                      <button onClick={() => setUmumOrder(o)} className="min-h-11 text-sm font-bold text-brand underline underline-offset-4">
                        Bayar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <CustomerDebtSheet customerId={customerId} onClose={() => setCustomerId(null)} />

      <Sheet open={umumOrder != null} onClose={() => setUmumOrder(null)} title="Bayar utang umum">
        {umumOrder && <UmumPayment order={umumOrder} onClose={() => setUmumOrder(null)} />}
      </Sheet>
    </>
  );
}

function UmumPayment({ order, onClose }) {
  // Data order diambil dari daftar; setelah dibayar sebagian, daftar diperbarui dan sisa utang mengikuti.
  const debts = useQuery({ queryKey: ['debts'], queryFn: () => api.get('/api/debts') });
  const current = debts.data?.umumOrders.find((o) => o.orderId === order.orderId);
  if (debts.data && !current) {
    return (
      <div className="space-y-4">
        <Notice tone="ok">Utang ini sudah lunas.</Notice>
        <Button className="w-full" onClick={onClose}>
          Selesai
        </Button>
      </div>
    );
  }
  const o = current ?? order;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-base font-bold text-ink">{o.note || 'Tanpa catatan'}</p>
        <p className="text-sm text-muted">
          {formatDateTime(o.orderedAt)} · {o.qty} galon · total {formatRupiah(o.total)}
        </p>
        <p className="mt-2 text-sm font-semibold text-muted">Sisa utang</p>
        <p className="text-3xl font-extrabold text-danger">{formatRupiah(o.outstanding)}</p>
      </div>
      <PaymentForm target={{ orderId: o.orderId }} outstanding={o.outstanding} />
    </div>
  );
}

function CustomerDebtSheet({ customerId, onClose }) {
  const open = customerId != null;
  const detail = useQuery({
    queryKey: ['debt-customer', customerId],
    queryFn: () => api.get(`/api/debts/customers/${customerId}`),
    enabled: open,
  });
  const d = detail.data;

  return (
    <Sheet open={open} onClose={onClose} title={d?.customer.name ?? 'Utang pelanggan'}>
      {detail.isPending && <p className="text-muted">Memuat…</p>}
      {detail.isError && <Notice tone="error">{detail.error.message}</Notice>}
      {d && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-muted">Sisa utang</p>
            <p className={`text-4xl font-extrabold tracking-tight ${d.outstanding > 0 ? 'text-danger' : 'text-ok'}`}>{formatRupiah(d.outstanding)}</p>
            {d.customer.phone && <p className="text-sm text-muted">{d.customer.phone}</p>}
          </div>

          {d.outstanding > 0 ? (
            <PaymentForm target={{ customerId: d.customer.id }} outstanding={d.outstanding} />
          ) : (
            <Notice tone="ok">Tidak ada utang.</Notice>
          )}

          {d.orders.length > 0 && (
            <section aria-labelledby="open-orders">
              <h3 id="open-orders" className="mb-1 text-base font-extrabold text-ink">
                Order belum lunas
              </h3>
              <p className="mb-2 text-sm text-muted">Pembayaran masuk ke order tertua dulu.</p>
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {d.orders.map((o) => (
                  <li key={o.orderId} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-ink">
                        {formatDate(o.orderedAt, { day: 'numeric', month: 'short', year: 'numeric' })} · {o.qty} galon
                      </p>
                      {o.note && <p className="text-sm text-muted">“{o.note}”</p>}
                      {o.paid > 0 && <p className="text-sm text-muted">dari {formatRupiah(o.total)}, sudah dibayar {formatRupiah(o.paid)}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-extrabold text-danger">{formatRupiah(o.outstanding)}</p>
                      {o.paid > 0 && <Badge tone="warn">Sebagian</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <PaymentHistory payments={d.payments} />
        </div>
      )}
    </Sheet>
  );
}

function PaymentHistory({ payments }) {
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState('');

  const voidPayment = useMutation({
    mutationFn: (batchId) => api.patch(`/api/payments/${batchId}`, { voided: true }),
    onSuccess: () => {
      setConfirmId(null);
      setError('');
      for (const key of ['debts', 'debt-customer', 'orders', 'summary']) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => setError(err.message),
  });

  if (payments.length === 0) return null;
  return (
    <section aria-labelledby="pay-history">
      <h3 id="pay-history" className="mb-2 text-base font-extrabold text-ink">
        Riwayat pembayaran
      </h3>
      {error && (
        <Notice tone="error" role="alert" className="mb-2">
          {error}
        </Notice>
      )}
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {payments.map((p) => {
          const key = p.batchId ?? `order-${p.orderIds[0]}`;
          return (
            <li key={key} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-ink">{formatRupiah(p.amount)}</p>
                  <p className="text-sm text-muted">
                    {formatDateTime(p.paidAt)} · {p.byName}
                    {p.source === 'ORDER' && ' · dibayar saat order'}
                  </p>
                </div>
                {p.canVoid && confirmId !== key && (
                  <button onClick={() => setConfirmId(key)} className="min-h-11 shrink-0 text-sm font-semibold text-muted underline underline-offset-4 hover:text-danger">
                    Batalkan
                  </button>
                )}
              </div>
              {confirmId === key && (
                <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Konfirmasi pembatalan">
                  <span className="text-sm font-semibold text-ink">Batalkan pembayaran ini?</span>
                  <Button variant="danger" className="min-h-11 px-4 text-sm" loading={voidPayment.isPending} onClick={() => voidPayment.mutate(p.batchId)}>
                    Ya, batalkan
                  </Button>
                  <Button variant="secondary" className="min-h-11 px-4 text-sm" onClick={() => setConfirmId(null)}>
                    Tidak
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
