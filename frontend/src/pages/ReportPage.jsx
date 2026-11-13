import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import DownloadButton from '../components/DownloadButton.jsx';
import PeriodBar from '../components/PeriodBar.jsx';
import { Card, Notice, PageHeader } from '../components/ui.jsx';
import { api } from '../lib/api.mjs';
import { formatNumber, formatRupiah, shortDay } from '../lib/format.mjs';

function Row({ label, value, strong = false, tone = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-base text-muted">{label}</dt>
      <dd className={`text-base ${strong ? 'font-extrabold' : 'font-bold'} text-ink ${tone}`}>{value}</dd>
    </div>
  );
}

export default function ReportPage() {
  const [period, setPeriod] = useState('daily');
  const [date, setDate] = useState(null); // null = hari ini menurut server

  const report = useQuery({
    queryKey: ['report', period, date],
    queryFn: () => api.get(`/api/reports?period=${period}${date ? `&date=${date}` : ''}`),
  });
  const r = report.data;
  const t = r?.totals;

  return (
    <>
      <PageHeader title="Laporan" />
      <PeriodBar period={period} onPeriodChange={setPeriod} data={r} onNavigate={setDate} />

      {r && (
        <div className="mb-4">
          <DownloadButton path={`/api/export/report.xlsx?period=${r.period}&date=${r.range.from}`}>Unduh Excel</DownloadButton>
        </div>
      )}
      {report.isPending && <p className="text-muted">Memuat…</p>}
      {report.isError && <Notice tone="error">{report.error.message}</Notice>}

      {t && (
        <div className="space-y-4">
          <Card className="bg-brand-soft">
            <p className="text-sm font-semibold text-brand-dark">Uang masuk</p>
            <p className="text-4xl font-extrabold tracking-tight text-brand-deep">{formatRupiah(t.cashIn)}</p>
            <p className="mt-1 text-sm text-brand-dark">
              Dibayar saat order {formatRupiah(t.cashInAtOrder)} · pembayaran utang {formatRupiah(t.debtPayments)}
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-1 text-lg font-extrabold text-ink">Penjualan</h2>
              <dl className="divide-y divide-line">
                <Row label="Nilai penjualan" value={formatRupiah(t.sales)} strong />
                <Row label="Jumlah order" value={formatNumber(t.orderCount)} />
                <Row label="Galon terjual" value={formatNumber(t.gallons)} />
                <Row label="Diantar" value={`${formatNumber(t.deliveredGallons)} galon`} />
                <Row label="Diambil" value={`${formatNumber(t.pickupGallons)} galon`} />
                <Row label="Gratis dari paket" value={`${formatNumber(t.freeGallons)} galon`} />
              </dl>
              <p className="mt-2 text-sm text-muted">Nilai penjualan termasuk order yang masih utang.</p>
            </Card>

            <Card>
              <h2 className="mb-1 text-lg font-extrabold text-ink">Utang</h2>
              <dl className="divide-y divide-line">
                <Row label="Utang baru" value={formatRupiah(t.newDebt)} tone={t.newDebt > 0 ? 'text-danger' : ''} />
                <Row label="Pelunasan" value={formatRupiah(t.debtPayments)} tone={t.debtPayments > 0 ? 'text-ok' : ''} />
                <Row label="Keringanan" value={formatRupiah(t.waived)} />
              </dl>
              <p className="mt-2 text-sm text-muted">
                Pelunasan termasuk pembayaran untuk order periode sebelumnya. Keringanan = sisa utang yang dianggap lunas, bukan uang masuk.
              </p>
              <h2 className="mt-5 mb-1 text-lg font-extrabold text-ink">Pemakaian lain</h2>
              <dl>
                <Row label="Konsumsi pribadi" value={`${formatNumber(t.personalGallons)} galon`} />
              </dl>
            </Card>
          </div>

          <Card>
            <h2 className="mb-1 text-lg font-extrabold text-ink">Kas periode ini</h2>
            <dl className="divide-y divide-line">
              <Row label="Uang masuk" value={formatRupiah(t.cashIn)} />
              <Row label="Pengeluaran" value={formatRupiah(t.expenses)} />
              {t.wages > 0 && <Row label="Termasuk upah harian" value={formatRupiah(t.wages)} />}
              <Row label="Saldo" value={formatRupiah(t.balance)} strong tone={t.balance < 0 ? 'text-danger' : 'text-ok'} />
            </dl>
            <Link to="/keuangan" className="mt-2 inline-block min-h-11 py-2 text-sm font-bold text-brand underline underline-offset-4">
              Buka Keuangan
            </Link>
          </Card>

          {r.period !== 'daily' && <DailyBreakdown days={r.days} />}
        </div>
      )}
    </>
  );
}

function DailyBreakdown({ days }) {
  const max = Math.max(1, ...days.map((d) => d.gallons));
  return (
    <Card className="p-0">
      <h2 className="px-5 pt-5 pb-2 text-lg font-extrabold text-ink">Rincian per hari</h2>
      <ul className="divide-y divide-line">
        {days.map((d) => (
          <li key={d.date} className={`grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 ${d.orderCount === 0 ? 'opacity-60' : ''}`}>
            <span className="text-sm font-bold text-ink">{shortDay(d.date)}</span>
            <span className="min-w-0">
              <span className="block h-2.5 overflow-hidden rounded-full bg-brand-soft" aria-hidden="true">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(d.gallons / max) * 100}%` }} />
              </span>
              <span className="mt-1 block text-sm text-muted">
                {d.gallons} galon · {d.orderCount} order
              </span>
            </span>
            <span className="text-right text-sm font-extrabold text-ink">{formatRupiah(d.cashIn)}</span>
          </li>
        ))}
      </ul>
      <p className="px-5 pt-1 pb-4 text-sm text-muted">Kolom kanan = uang masuk pada hari itu.</p>
    </Card>
  );
}
