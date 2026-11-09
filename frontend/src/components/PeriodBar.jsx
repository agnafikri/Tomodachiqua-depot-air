import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Segmented } from './ui.jsx';
import { periodLabel } from '../lib/format.mjs';

const THIS = { daily: 'Hari ini', weekly: 'Minggu ini', monthly: 'Bulan ini' };

// Pemilih periode (harian/mingguan/bulanan) dengan tombol geser. Semua tanggal berasal dari server:
// data = { period, range: {from, to}, prevDate, nextDate, includesToday }.
export default function PeriodBar({ period, onPeriodChange, data, onNavigate }) {
  return (
    <div className="mb-5 space-y-3">
      <Segmented
        label="Periode"
        hideLabel
        value={period}
        onChange={onPeriodChange}
        options={[
          { value: 'daily', label: 'Harian' },
          { value: 'weekly', label: 'Mingguan' },
          { value: 'monthly', label: 'Bulanan' },
        ]}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Periode sebelumnya"
          disabled={!data}
          onClick={() => onNavigate(data.prevDate)}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-brand-dark hover:bg-brand-soft disabled:opacity-40"
        >
          <ChevronLeft className="size-6" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 text-center" aria-live="polite">
          <p className="truncate text-base font-extrabold text-ink">{data ? periodLabel(data.period, data.range.from, data.range.to) : '…'}</p>
          {data?.includesToday && <Badge tone="brand">{THIS[data.period]}</Badge>}
        </div>
        <button
          type="button"
          aria-label="Periode berikutnya"
          disabled={!data || !data.nextDate}
          onClick={() => onNavigate(data.nextDate)}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-brand-dark hover:bg-brand-soft disabled:opacity-40"
        >
          <ChevronRight className="size-6" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
