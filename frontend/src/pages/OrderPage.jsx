import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Truck, Store } from 'lucide-react';
import CustomerPicker from '../components/CustomerPicker.jsx';
import { Badge, Button, Card, Input, Notice, PageHeader, Segmented } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.mjs';
import { digitsOnly, formatRupiah, formatTime, newRequestId } from '../lib/format.mjs';
import { fieldErrorsFrom, useCustomers, useDebounced } from '../lib/hooks.mjs';

const MAX_QTY = 1000;

// Order mempengaruhi daftar order, utang, stok toren, dan ringkasan Beranda.
function refreshAfterOrderChange(queryClient) {
  for (const key of ['orders', 'debts', 'debt-customer', 'tank', 'tank-history', 'summary']) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export default function OrderPage() {
  return (
    <>
      <PageHeader title="Order" />
      {/* grid-cols-1 = minmax(0,1fr): kolom tidak boleh melebar mengikuti isi. Tanpa ini, di HP
          halaman melebar (±576 px) dan browser menciutkan tampilan ("ter-zoom"). */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[26rem_minmax(0,1fr)] lg:items-start">
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
  const [fieldErrors, setFieldErrors] = useState({});

  const qty = qtyText === '' ? null : Number.parseInt(qtyText, 10);
  const qtyValid = qty != null && qty >= 1 && qty <= MAX_QTY;
  const debouncedQty = useDebounced(qty, 250);

  // Pelanggan bernama dengan harga khusus (warung) hampir selalu diantar; pembeli umum biasanya mengambil sendiri.
  function selectCustomer(c) {
    setCustomer(c);
    setIsDelivered(Boolean(c?.customPrice));
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
      setFieldErrors({});
      setRequestId(newRequestId()); // order berikutnya = permintaan baru
      refreshAfterOrderChange(queryClient);
    },
    // requestId sengaja TIDAK diganti saat gagal: kirim ulang tidak akan membuat order ganda.
    onError: (err) => {
      setSaved(null);
      if (err.code === 'VALIDATION_ERROR') {
        setFieldErrors(fieldErrorsFrom(err));
        setError('');
      } else {
        setError(err.message);
      }
    },
  });

  function submit(e) {
    e.preventDefault();
    if (!qtyValid) {
      setError(`Isi jumlah galon antara 1 dan ${MAX_QTY}.`);
      return;
    }
    setError('');
    if (payStatus === 'DEBT' && !customer && !note.trim()) {
      setFieldErrors({ note: 'Isi catatan: siapa yang berutang.' });
      return;
    }
    setFieldErrors({});
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
            { value: 'DEBT', label: 'Utang' },
          ]}
        />

        <Input
          label={payStatus === 'DEBT' && !customer ? 'Catatan: siapa yang berutang' : 'Catatan (boleh kosong)'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={fieldErrors.note}
          maxLength={200}
          placeholder={payStatus === 'DEBT' && !customer ? 'Mis. Pak Dedi RT 3' : 'Mis. bayar hari Jumat'}
        />

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
  const [pickedDate, setPickedDate] = useState(null); // null = hari ini menurut server
  const [confirmId, setConfirmId] = useState(null);
  const [voidError, setVoidError] = useState('');

  // Tanpa tanggal, server menjawab dengan "hari ini" menurut jamnya (zona Jakarta).
  // Jam perangkat tidak dipakai, supaya tanggal selalu sama dengan yang dipakai saat order disimpan.
  const orders = useQuery({
    queryKey: ['orders', pickedDate],
    queryFn: () => api.get(pickedDate ? `/api/orders?from=${pickedDate}&to=${pickedDate}` : '/api/orders'),
  });

  const voidOrder = useMutation({
    mutationFn: (id) => api.patch(`/api/orders/${id}`, { voided: true }),
    onSuccess: () => {
      setConfirmId(null);
      setVoidError('');
      refreshAfterOrderChange(queryClient);
    },
    onError: (err) => setVoidError(err.message),
  });

  useEffect(() => setConfirmId(null), [pickedDate]);

  const today = orders.data?.today;
  const date = pickedDate ?? today ?? '';
  const isToday = date === today;
  const canVoid = user.role === 'ADMIN' || isToday;
  const list = orders.data?.orders ?? [];
  const summary = orders.data?.summary;

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 p-5 pb-3">
        <div>
          <h2 className="text-lg font-extrabold text-ink">{isToday ? 'Order hari ini' : 'Daftar order'}</h2>
          {summary && (
            <p className="text-sm text-muted">
              {summary.orderCount} order · {summary.gallons} galon · {formatRupiah(summary.total)}
              {summary.unpaid > 0 && <span className="font-semibold text-danger"> · belum dibayar {formatRupiah(summary.unpaid)}</span>}
            </p>
          )}
        </div>
        <label className="text-sm font-semibold text-ink">
          <span className="sr-only">Tanggal</span>
          <input type="date" value={date} max={today} disabled={!today} onChange={(e) => e.target.value && setPickedDate(e.target.value === today ? null : e.target.value)} className="min-h-11 rounded-xl border border-line bg-white px-3 text-base" />
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
                <Badge tone={o.paymentStatus === 'PAID' ? 'ok' : o.paymentStatus === 'PARTIAL' ? 'warn' : 'danger'}>
                  {o.paymentStatus === 'PAID' ? 'Lunas' : o.paymentStatus === 'PARTIAL' ? 'Sebagian' : 'Utang'}
                </Badge>
                {o.waivedAmount > 0 && <p className="mt-0.5 text-xs text-muted">keringanan {formatRupiah(o.waivedAmount)}</p>}
              </div>
            </div>

            {canVoid && confirmId !== o.id && (
              <Button variant="dangerOutline" className="mt-2 min-h-11 px-4 text-sm" onClick={() => setConfirmId(o.id)}>
                Batalkan order
              </Button>
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
