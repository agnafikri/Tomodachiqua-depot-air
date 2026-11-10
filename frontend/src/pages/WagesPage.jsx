import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import EmployeesSheet from '../components/EmployeesSheet.jsx';
import PeriodBar from '../components/PeriodBar.jsx';
import { Badge, Button, Card, Checkbox, Input, LinkButton, Notice, PageHeader, Select } from '../components/ui.jsx';
import { api } from '../lib/api.mjs';
import { digitsOnly, formatDate, formatRupiah, newRequestId, shortDay } from '../lib/format.mjs';

const REFRESH = ['wage-day', 'wage-slips', 'finance', 'report', 'summary'];

export default function WagesPage() {
  const [managing, setManaging] = useState(false);
  return (
    <>
      <PageHeader title="Upah">Upah harian karyawan. Nominalnya ditentukan pemilik setiap hari.</PageHeader>
      <div className="space-y-6">
        <PayDay onManage={() => setManaging(true)} />
        <SlipHistory />
      </div>
      {managing && <EmployeesSheet onClose={() => setManaging(false)} />}
    </>
  );
}

function Line({ label, value, strong = false, tone = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-base text-muted">{label}</dt>
      <dd className={`text-base ${strong ? 'font-extrabold' : 'font-bold'} text-ink ${tone}`}>{value}</dd>
    </div>
  );
}

function PayDay({ onManage }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(null); // null = hari ini menurut server
  const [rows, setRows] = useState({});
  const [requestId, setRequestId] = useState(newRequestId);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});

  const day = useQuery({ queryKey: ['wage-day', date], queryFn: () => api.get(date ? `/api/wages?date=${date}` : '/api/wages') });
  const d = day.data;

  useEffect(() => {
    setRows({});
    setCreated(null);
    setError('');
    setErrors({});
  }, [date]);

  const setRow = (id, patch) => setRows((r) => ({ ...r, [id]: { checked: false, amount: '', note: '', ...r[id], ...patch } }));
  const picked = d ? d.employees.filter((e) => !e.slip && rows[e.id]?.checked) : [];
  const amountOf = (id) => Number.parseInt(rows[id]?.amount, 10) || 0;
  const planned = picked.reduce((s, e) => s + amountOf(e.id), 0);
  const remaining = d ? d.cashIn - d.expenses - d.wagesPaid - planned : 0;

  const save = useMutation({
    mutationFn: (items) => api.post('/api/wages', { wageDate: d.date, items, clientRequestId: requestId }),
    onSuccess: ({ slips }) => {
      setCreated(slips);
      setRows({});
      setError('');
      setErrors({});
      setRequestId(newRequestId());
      for (const key of REFRESH) queryClient.invalidateQueries({ queryKey: [key] });
    },
    // requestId tidak diganti saat gagal: kirim ulang tidak membuat slip ganda.
    onError: (err) => {
      setCreated(null);
      if (err.code === 'VALIDATION_ERROR') setError([...new Set((err.details ?? []).map((x) => x.message))].join(' '));
      else setError(err.message);
      if (err.code === 'WAGE_EXISTS') queryClient.invalidateQueries({ queryKey: ['wage-day'] });
    },
  });

  function submit(e) {
    e.preventDefault();
    setError('');
    const bad = {};
    for (const emp of picked) if (amountOf(emp.id) < 1) bad[emp.id] = 'Isi upah.';
    setErrors(bad);
    if (picked.length === 0) return setError('Centang karyawan yang masuk.');
    if (Object.keys(bad).length) return undefined;
    return save.mutate(picked.map((emp) => ({ employeeId: emp.id, amount: amountOf(emp.id), note: rows[emp.id].note })));
  }

  return (
    <section aria-labelledby="pay-day" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="pay-day" className="text-xl font-extrabold text-ink">
          {d && d.date === d.today ? 'Upah hari ini' : 'Catat upah'}
        </h2>
        <label className="text-sm font-semibold text-ink">
          <span className="sr-only">Tanggal upah</span>
          <input
            type="date"
            value={d?.date ?? ''}
            max={d?.today}
            disabled={!d}
            onChange={(e) => e.target.value && setDate(e.target.value === d.today ? null : e.target.value)}
            className="min-h-11 rounded-xl border border-line bg-white px-3 text-base"
          />
        </label>
      </div>

      {day.isPending && <p className="text-muted">Memuat…</p>}
      {day.isError && <Notice tone="error">{day.error.message}</Notice>}

      {d && (
        <>
          <Card className="bg-brand-soft">
            <p className="text-sm font-semibold text-brand-dark">Acuan: uang masuk {d.date === d.today ? 'hari ini' : formatDate(`${d.date}T00:00:00Z`, { day: 'numeric', month: 'long' })}</p>
            <p className="text-3xl font-extrabold tracking-tight text-brand-deep">{formatRupiah(d.cashIn)}</p>
            <dl className="mt-2 divide-y divide-brand-line/70">
              <Line label="Pengeluaran lain" value={formatRupiah(d.expenses)} />
              {d.wagesPaid > 0 && <Line label="Upah sudah dibayar" value={formatRupiah(d.wagesPaid)} />}
              {planned > 0 && <Line label="Upah yang akan dibayar" value={formatRupiah(planned)} />}
              <Line label="Sisa kas setelah upah" value={formatRupiah(remaining)} strong tone={remaining < 0 ? 'text-danger' : 'text-ok'} />
            </dl>
            <p className="mt-2 text-sm text-brand-dark">Angka ini hanya acuan. Nominal upah tiap karyawan ditentukan sendiri.</p>
          </Card>

          {created && (
            <Notice tone="ok" role="status" className="space-y-2">
              <p>{created.length} slip upah tersimpan.</p>
              <div className="flex flex-wrap gap-2">
                {created.map((s) => (
                  <LinkButton key={s.id} to={`/upah/slip/${s.id}`}>
                    Buka slip {s.employeeName}
                  </LinkButton>
                ))}
              </div>
            </Notice>
          )}
          {error && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}

          <form onSubmit={submit} noValidate className="space-y-4">
            {d.employees.length === 0 ? (
              <Card className="space-y-3">
                <p className="text-muted">Belum ada karyawan aktif. Tambahkan karyawan dulu.</p>
                <Button type="button" onClick={onManage}>
                  Tambah karyawan
                </Button>
              </Card>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                {d.employees.map((e) => {
                  const row = rows[e.id] ?? { checked: false, amount: '', note: '' };
                  return (
                    <li key={e.id} className="px-4 py-2">
                      {e.slip ? (
                        <div className="flex min-h-12 items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-bold text-ink">{e.name}</p>
                            <p className="text-sm text-ok">Sudah dibayar {formatRupiah(e.slip.amount)}</p>
                          </div>
                          <LinkButton to={`/upah/slip/${e.slip.id}`}>Lihat slip</LinkButton>
                        </div>
                      ) : (
                        <>
                          <Checkbox label={e.name} checked={row.checked} onChange={(ev) => setRow(e.id, { checked: ev.target.checked })} />
                          {row.checked && (
                            <div className="mt-1 mb-3 space-y-3 pl-9">
                              <Input
                                label={`Upah ${e.name} (Rp)`}
                                inputMode="numeric"
                                value={row.amount}
                                onChange={(ev) => setRow(e.id, { amount: digitsOnly(ev.target.value).slice(0, 8) })}
                                error={errors[e.id]}
                                hint={row.amount ? formatRupiah(Number(row.amount)) : undefined}
                              />
                              <Input
                                label={`Catatan ${e.name} (boleh kosong)`}
                                value={row.note}
                                onChange={(ev) => setRow(e.id, { note: ev.target.value })}
                                maxLength={200}
                                placeholder="Mis. lembur, ramai hari ini"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {d.employees.length > 0 && (
              <Button type="submit" loading={save.isPending} disabled={picked.length === 0} className="w-full">
                {save.isPending ? 'Menyimpan…' : picked.length > 0 ? `Simpan dan bayar (${picked.length} karyawan)` : 'Simpan dan bayar'}
              </Button>
            )}
          </form>

          <Button type="button" variant="secondary" onClick={onManage} className="w-full">
            <Users className="size-5" aria-hidden="true" />
            Kelola karyawan
          </Button>
        </>
      )}
    </section>
  );
}

function SlipHistory() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState('monthly');
  const [date, setDate] = useState(null);
  const [employeeId, setEmployeeId] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState('');

  const query = `period=${period}${date ? `&date=${date}` : ''}${employeeId ? `&employeeId=${employeeId}` : ''}`;
  const slips = useQuery({ queryKey: ['wage-slips', query], queryFn: () => api.get(`/api/wages/slips?${query}`) });
  const employees = useQuery({ queryKey: ['employees'], queryFn: async () => (await api.get('/api/employees')).employees });

  const voidSlip = useMutation({
    mutationFn: (id) => api.patch(`/api/wages/slips/${id}`, { voided: true }),
    onSuccess: () => {
      setConfirmId(null);
      setError('');
      for (const key of REFRESH) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => setError(err.message),
  });

  const s = slips.data;
  return (
    <section aria-labelledby="slip-history" className="space-y-4">
      <h2 id="slip-history" className="text-xl font-extrabold text-ink">
        Riwayat slip
      </h2>
      <PeriodBar period={period} onPeriodChange={setPeriod} data={s} onNavigate={setDate} />
      <Select
        label="Karyawan"
        value={employeeId}
        onChange={(e) => setEmployeeId(e.target.value)}
        options={[{ value: '', label: 'Semua karyawan' }, ...(employees.data ?? []).map((e) => ({ value: String(e.id), label: e.name }))]}
      />

      {slips.isPending && <p className="text-muted">Memuat…</p>}
      {slips.isError && <Notice tone="error">{slips.error.message}</Notice>}
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}

      {s && (
        <Card className="p-0">
          <div className="px-5 pt-5 pb-2">
            <p className="text-sm font-semibold text-muted">Total upah periode ini</p>
            <p className="text-2xl font-extrabold text-ink">{formatRupiah(s.total)}</p>
            <p className="text-sm text-muted">{s.slips.length} slip</p>
          </div>
          {s.slips.length === 0 && <p className="px-5 pb-5 text-muted">Belum ada slip pada periode ini.</p>}
          <ul className="divide-y divide-line">
            {s.slips.map((x) => (
              <li key={x.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-ink">{x.employeeName}</p>
                    <p className="text-sm text-muted">{shortDay(x.wageDate)}</p>
                    {x.note && <p className="text-sm text-muted">“{x.note}”</p>}
                  </div>
                  <p className="shrink-0 text-base font-extrabold text-ink">{formatRupiah(x.amount)}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <LinkButton to={`/upah/slip/${x.id}`}>Buka slip</LinkButton>
                  {x.canVoid && confirmId !== x.id && (
                    <Button variant="dangerOutline" className="min-h-11 px-4 text-sm" onClick={() => setConfirmId(x.id)}>
                      Batalkan
                    </Button>
                  )}
                </div>
                {confirmId === x.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Konfirmasi pembatalan">
                    <span className="text-sm font-semibold text-ink">Batalkan slip ini?</span>
                    <Button variant="danger" className="min-h-11 px-4 text-sm" loading={voidSlip.isPending} onClick={() => voidSlip.mutate(x.id)}>
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
      )}
      <Badge tone="neutral">Rekap per karyawan ada di menu Keuangan.</Badge>
    </section>
  );
}
