import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Truck, Store } from 'lucide-react';
import CustomerPicker from '../components/CustomerPicker.jsx';
import { Badge, Button, Card, Input, Notice, PageHeader, Segmented } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.mjs';
import { digitsOnly, formatRupiah, formatTime, newRequestId, todayJakarta } from '../lib/format.mjs';
import { useCustomers, useDebounced } from '../lib/hooks.mjs';

const MAX_QTY = 1000;

export default function OrderPage() {
  return (
    <>
      <PageHeader title="Order" />
      <div className="grid gap-5 lg:grid-cols-[26rem_1fr] lg:items-start">
        <OrderForm />
        <TodayOrders />
      </div>
    </>
  );
}

function OrderForm() {
  const queryClient = useQueryClient();
  const customersQuery = useCustomers();

  const [customer, setCustomer] = useState(null); // null = Umum
  const [qtyText, setQtyText] = useState('1');
  const [isDelivered, setIsDelivered] = useState(false);
  const [payStatus, setPayStatus] = useState('PAID');
  const [note, setNote] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');

  const qty = qtyText === '' ? null : Number.parseInt(qtyText, 10);
  const qtyValid = qty != null && qty >= 1 && qty <= MAX_QTY;
  const debouncedQty = useDebounced(qty, 250);

  // Pelanggan bernama dengan harga khusus (warung) hampir selalu diantar; pembeli umum biasanya mengambil sendiri.
  function selectCustomer(c) {
    setCustomer(c);
    setIsDelivered(Boolean(c?.customPrice));
    if (!c) setPayStatus('PAID');
  }

  const previewQty = debouncedQty != null && debouncedQty >= 1 && debouncedQty <= MAX_QTY ? debouncedQty : null;
  const preview = useQuery({
    queryKey: ['order-preview', customer?.id ?? null, previewQty, isDelivered],
    queryFn: async () => (await api.post('/api/orders/preview', { customerId: customer?.id ?? null, qty: previewQty, isDelivered })).price,
    enabled: previewQty != null,
    staleTime: 60_000,
    retry: false,
  });
  const price = qtyValid && previewQty === qty ? preview.data : null;

  const save = useMutation({
    mutationFn: () =>
      api.post('/api/orders', { customerId: customer?.id ?? null, qty, isDelivered, payStatus, note, clientRequestId: requestId }),
    onSuccess: ({ order }) => {
      setSaved(order);
      setError('');
      setCustomer(null);
      setQtyText('1');
      setIsDelivered(false);
      setPayStatus('PAID');
      setNote('');
      setRequestId(newRequestId()); // order berikutnya = permintaan baru
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    // requestId sengaja TIDAK diganti saat gagal: kirim ulang tidak akan membuat order ganda.
    onError: (err) => {
      setSaved(null);
      setError(err.message);
    },
  });

  function submit(e) {
    e.preventDefault();
    if (!qtyValid) {
      setError(`Isi jumlah galon antara 1 dan ${MAX_QTY}.`);
      return;
    }
    setError('');
    save.mutate();
  }

  function stepQty(delta) {
    const next = Math.min(MAX_QTY, Math.max(1, (qty ?? 0) + delta));
    setQtyText(String(next));
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate className="space-y-5">
        {saved && (
          <Notice tone="ok" role="status">
            Order tersimpan: {saved.customerName ?? 'Umum'}, {saved.qty} galon, {formatRupiah(saved.total)} ({saved.paymentStatus === 'PAID' ? 'lunas' : 'utang'}).
          </Notice>
        )}
        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}

        <CustomerPicker value={customer} onChange={selectCustomer} customers={customersQuery.data} loading={customersQuery.isPending} />

        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink" id="qty-label">
            Jumlah galon
          </p>
          <div className="flex items-center gap-2" role="group" aria-labelledby="qty-label">
            <button type="button" aria-label="Kurangi satu galon" onClick={() => stepQty(-1)} className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark active:bg-brand-line">
              <Minus className="size-6" aria-hidden="true" />
            </button>
            <input
              aria-label="Jumlah galon"
              inputMode="numeric"
              pattern="[0-9]*"
              value={qtyText}
              onChange={(e) => setQtyText(digitsOnly(e.target.value).slice(0, 4))}
              onFocus={(e) => e.target.select()}
              className="min-h-14 min-w-0 flex-1 rounded-xl border border-line bg-white text-center text-3xl font-extrabold text-ink"
            />
            <button type="button" aria-label="Tambah satu galon" onClick={() => stepQty(1)} className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark active:bg-brand-line">
              <Plus className="size-6" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            {[5, 10, 20].map((n) => (
              <button key={n} type="button" onClick={() => stepQty(n)} className="min-h-11 flex-1 rounded-xl border border-line bg-white text-sm font-bold text-brand-dark active:bg-brand-soft">
                +{n}
              </button>
            ))}
          </div>
        </div>

        <Segmented
          label="Pengantaran"
          value={isDelivered}
          onChange={setIsDelivered}
          options={[
            { value: true, label: 'Diantar' },
            { value: false, label: 'Diambil' },
          ]}
        />

        <Segmented
          label="Pembayaran"
          value={payStatus}
          onChange={setPayStatus}
          options={[
            { value: 'PAID', label: 'Lunas' },
            { value: 'DEBT', label: 'Utang', disabled: !customer },
          ]}
        />
        {!customer && <p className="-mt-3 text-sm text-muted">Utang hanya untuk pelanggan bernama.</p>}

        <Input label="Catatan (boleh kosong)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Mis. bayar hari Jumat" />

        <PriceSummary price={price} loading={qtyValid && !price && previewQty === qty && preview.isFetching} failed={qtyValid && preview.isError} />

        <Button type="submit" loading={save.isPending} disabled={!qtyValid || !price} className="w-full">
          {save.isPending ? 'Menyimpan…' : 'Simpan order'}
        </Button>
      </form>
    </Card>
  );
}

function PriceSummary({ price, loading, failed }) {
  return (
    <div className="rounded-2xl bg-brand-soft p-4" aria-live="polite">
      <p className="text-sm font-semibold text-brand-dark">Total bayar</p>
      <p className="text-4xl font-extrabold tracking-tight text-brand-deep">{price ? formatRupiah(price.total) : '—'}</p>
      {price && (
        <p className="mt-1 text-sm text-brand-dark">
          {price.paidQty} galon × {formatRupiah(price.unitPrice)}
          {price.priceRule === 'CUSTOM' && ' (harga khusus pelanggan)'}
          {price.freeQty > 0 && ` · gratis ${price.freeQty} galon (paket beli ${price.bundle.buy} bayar ${price.bundle.pay})`}
        </p>
      )}
      {loading && <p className="mt-1 text-sm text-brand-dark">Menghitung…</p>}
      {failed && <p className="mt-1 text-sm font-semibold text-danger">Harga belum bisa dihitung. Periksa koneksi lalu coba lagi.</p>}
    </div>
  );
}

function TodayOrders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = useMemo(todayJakarta, []);
  const [date, setDate] = useState(today);
  const [confirmId, setConfirmId] = useState(null);
  const [voidError, setVoidError] = useState('');

  const orders = useQuery({
    queryKey: ['orders', date],
    queryFn: () => api.get(`/api/orders?from=${date}&to=${date}`),
  });

  const voidOrder = useMutation({
    mutationFn: (id) => api.patch(`/api/orders/${id}`, { voided: true }),
    onSuccess: () => {
      setConfirmId(null);
      setVoidError('');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err) => setVoidError(err.message),
  });

  useEffect(() => setConfirmId(null), [date]);

  const canVoid = user.role === 'ADMIN' || date === today;
  const list = orders.data?.orders ?? [];
  const summary = orders.data?.summary;

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 p-5 pb-3">
        <div>
          <h2 className="text-lg font-extrabold text-ink">{date === today ? 'Order hari ini' : 'Daftar order'}</h2>
          {summary && (
            <p className="text-sm text-muted">
              {summary.orderCount} order · {summary.gallons} galon · {formatRupiah(summary.total)}
              {summary.unpaid > 0 && <span className="font-semibold text-danger"> · belum dibayar {formatRupiah(summary.unpaid)}</span>}
            </p>
          )}
        </div>
        <label className="text-sm font-semibold text-ink">
          <span className="sr-only">Tanggal</span>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="min-h-11 rounded-xl border border-line bg-white px-3 text-base" />
        </label>
      </div>

      {voidError && (
        <Notice tone="error" role="alert" className="mx-5 mb-3">
          {voidError}
        </Notice>
      )}
      {orders.isPending && <p className="px-5 pb-5 text-muted">Memuat…</p>}
      {orders.isError && <Notice tone="error" className="mx-5 mb-5">{orders.error.message}</Notice>}
      {orders.isSuccess && list.length === 0 && <p className="px-5 pb-5 text-muted">Belum ada order di tanggal ini.</p>}

      <ul className="divide-y divide-line">
        {list.map((o) => (
          <li key={o.id} className="px-5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-ink">{o.customerName ?? 'Umum'}</p>
                <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
                  <span>{formatTime(o.orderedAt)}</span>·<span>{o.qty} galon</span>·
                  <span className="inline-flex items-center gap-1">
                    {o.isDelivered ? <Truck className="size-4" aria-hidden="true" /> : <Store className="size-4" aria-hidden="true" />}
                    {o.isDelivered ? 'Diantar' : 'Diambil'}
                  </span>
                </p>
                {o.note && <p className="text-sm text-muted">“{o.note}”</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-extrabold text-ink">{formatRupiah(o.total)}</p>
                <Badge tone={o.paymentStatus === 'PAID' ? 'ok' : 'danger'}>
                  {o.paymentStatus === 'PAID' ? 'Lunas' : o.paymentStatus === 'PARTIAL' ? 'Sebagian' : 'Utang'}
                </Badge>
              </div>
            </div>

            {canVoid && confirmId !== o.id && (
              <button onClick={() => setConfirmId(o.id)} className="mt-1 min-h-11 text-sm font-semibold text-muted underline underline-offset-4 hover:text-danger">
                Batalkan order
              </button>
            )}
            {confirmId === o.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Konfirmasi pembatalan">
                <span className="text-sm font-semibold text-ink">Batalkan order ini?</span>
                <Button variant="danger" className="min-h-11 px-4 text-sm" loading={voidOrder.isPending} onClick={() => voidOrder.mutate(o.id)}>
                  Ya, batalkan
                </Button>
                <Button variant="secondary" className="min-h-11 px-4 text-sm" onClick={() => setConfirmId(null)}>
                  Tidak
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
