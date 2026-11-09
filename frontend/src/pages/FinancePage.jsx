import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import PeriodBar from '../components/PeriodBar.jsx';
import { Button, Card, Input, Notice, PageHeader, Select, Sheet } from '../components/ui.jsx';
import { api } from '../lib/api.mjs';
import { digitsOnly, formatRupiah, newRequestId, shortDay } from '../lib/format.mjs';
import { fieldErrorsFrom } from '../lib/hooks.mjs';

const REFRESH = ['finance', 'expenses', 'report', 'summary'];

export default function FinancePage() {
  const [period, setPeriod] = useState('daily');
  const [date, setDate] = useState(null);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState('');
  const suffix = `period=${period}${date ? `&date=${date}` : ''}`;

  const finance = useQuery({ queryKey: ['finance', period, date], queryFn: () => api.get(`/api/finance?${suffix}`) });
  const f = finance.data;

  return (
    <>
      <PageHeader title="Keuangan" />
      <PeriodBar period={period} onPeriodChange={setPeriod} data={f} onNavigate={setDate} />

      {saved && (
        <Notice tone="ok" role="status" className="mb-4">
          {saved}
        </Notice>
      )}
      {finance.isPending && <p className="text-muted">Memuat…</p>}
      {finance.isError && <Notice tone="error">{finance.error.message}</Notice>}

      {f && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat title="Pemasukan" value={formatRupiah(f.income.total)} tone="text-ok" />
            <Stat title="Pengeluaran" value={formatRupiah(f.expenses.total)} tone="text-danger" />
            <Stat title="Saldo" value={formatRupiah(f.balance)} tone={f.balance < 0 ? 'text-danger' : 'text-brand-deep'} highlight className="col-span-2 sm:col-span-1" />
          </div>
          <p className="text-sm text-muted">
            Pemasukan = uang yang benar-benar diterima: dibayar saat order {formatRupiah(f.income.atOrder)} + pembayaran utang {formatRupiah(f.income.debtPayments)}.
            {f.waived > 0 && ` Keringanan utang ${formatRupiah(f.waived)} tidak dihitung sebagai pemasukan.`}
          </p>

          <Button onClick={() => setAdding(true)} className="w-full">
            <Plus className="size-5" aria-hidden="true" />
            Catat pengeluaran
          </Button>

          <Card>
            <h2 className="mb-3 text-lg font-extrabold text-ink">Pengeluaran per kategori</h2>
            {f.expenses.byCategory.length === 0 ? (
              <p className="text-muted">Belum ada pengeluaran pada periode ini.</p>
            ) : (
              <ul className="space-y-3">
                {f.expenses.byCategory.map((c) => (
                  <li key={c.category}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-base font-semibold text-ink">{c.label}</span>
                      <span className="text-base font-extrabold text-ink">{formatRupiah(c.amount)}</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-brand-soft" aria-hidden="true">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${c.percent}%` }} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      {c.percent}% · {c.count} catatan
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <ExpenseList suffix={suffix} />
        </div>
      )}

      {adding && f && <ExpenseSheet finance={f} onClose={() => setAdding(false)} onSaved={setSaved} />}
    </>
  );
}

function Stat({ title, value, tone, highlight = false, className = '' }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-4 ${highlight ? 'border-brand-line bg-brand-soft' : 'border-line bg-white'} ${className}`}>
      <p className="text-sm font-semibold text-muted">{title}</p>
      <p className={`text-2xl font-extrabold tracking-tight ${tone}`}>{value}</p>
    </div>
  );
}

function ExpenseList({ suffix }) {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['expenses', suffix], queryFn: () => api.get(`/api/expenses?${suffix}`) });
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState('');

  const voidExpense = useMutation({
    mutationFn: (id) => api.patch(`/api/expenses/${id}`, { voided: true }),
    onSuccess: () => {
      setConfirmId(null);
      setError('');
      for (const key of REFRESH) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => setError(err.message),
  });

  const items = list.data?.items ?? [];
  return (
    <Card className="p-0">
      <h2 className="px-5 pt-5 pb-2 text-lg font-extrabold text-ink">Daftar pengeluaran</h2>
      {error && (
        <Notice tone="error" role="alert" className="mx-5 mb-2">
          {error}
        </Notice>
      )}
      {list.isPending && <p className="px-5 pb-5 text-muted">Memuat…</p>}
      {list.isSuccess && items.length === 0 && <p className="px-5 pb-5 text-muted">Belum ada pengeluaran.</p>}
      <ul className="divide-y divide-line">
        {items.map((e) => (
          <li key={e.id} className="px-5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-bold text-ink">{e.categoryLabel}</p>
                <p className="text-sm text-muted">
                  {shortDay(e.spentDate)} · {e.byName}
                </p>
                {e.note && <p className="text-sm text-muted">“{e.note}”</p>}
              </div>
              <p className="shrink-0 text-base font-extrabold text-danger">{formatRupiah(e.amount)}</p>
            </div>
            {e.canVoid && confirmId !== e.id && (
              <Button variant="dangerOutline" className="mt-2 min-h-11 px-4 text-sm" onClick={() => setConfirmId(e.id)}>
                Batalkan
              </Button>
            )}
            {confirmId === e.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Konfirmasi pembatalan">
                <span className="text-sm font-semibold text-ink">Batalkan pengeluaran ini?</span>
                <Button variant="danger" className="min-h-11 px-4 text-sm" loading={voidExpense.isPending} onClick={() => voidExpense.mutate(e.id)}>
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

function ExpenseSheet({ finance, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('');
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(finance.today);
  const [note, setNote] = useState('');
  const [requestId] = useState(newRequestId); // tetap sama saat gagal kirim: tidak ada catatan ganda
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});

  const save = useMutation({
    mutationFn: (body) => api.post('/api/expenses', { ...body, clientRequestId: requestId }),
    onSuccess: () => {
      for (const key of REFRESH) queryClient.invalidateQueries({ queryKey: [key] });
      onSaved('Pengeluaran tersimpan.');
      onClose();
    },
    onError: (err) => {
      if (err.code === 'VALIDATION_ERROR') setErrors(fieldErrorsFrom(err));
      else setError(err.message);
    },
  });

  function submit(e) {
    e.preventDefault();
    setError('');
    const amount = amountText === '' ? 0 : Number.parseInt(amountText, 10);
    const next = {};
    if (!category) next.category = 'Pilih kategori pengeluaran.';
    if (!amount || amount < 1) next.amount = 'Isi jumlah pengeluaran.';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({ category, amount, spentDate: date, note });
  }

  return (
    <Sheet open onClose={onClose} title="Catat pengeluaran">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
        <Select
          label="Kategori"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Pilih kategori"
          options={finance.categories.map((c) => ({ value: c.code, label: c.label }))}
          error={errors.category}
        />
        <Input
          label="Jumlah (Rp)"
          inputMode="numeric"
          value={amountText}
          onChange={(e) => setAmountText(digitsOnly(e.target.value).slice(0, 10))}
          error={errors.amount}
          hint={amountText ? formatRupiah(Number(amountText)) : undefined}
        />
        <Input label="Tanggal" type="date" value={date} max={finance.today} onChange={(e) => e.target.value && setDate(e.target.value)} error={errors.spentDate} />
        <Input label="Catatan (boleh kosong)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Mis. token listrik" />
        <Button type="submit" loading={save.isPending} className="w-full">
          {save.isPending ? 'Menyimpan…' : 'Simpan pengeluaran'}
        </Button>
      </form>
    </Sheet>
  );
}
