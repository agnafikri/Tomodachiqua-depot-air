import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Droplets, Gauge, Home, SlidersHorizontal } from 'lucide-react';
import { AdjustSheet, PersonalUseSheet, RefillSheet } from '../components/TankForms.jsx';
import { Button, Card, Notice, PageHeader, ProgressBar } from '../components/ui.jsx';
import { api } from '../lib/api.mjs';
import { daysLeftText, formatDate, formatDateTime, formatDecimal, formatLiters, formatNumber } from '../lib/format.mjs';

const TONE = { OK: 'ok', LOW: 'warn', CRITICAL: 'danger' };

export default function TankPage() {
  const tankQuery = useQuery({ queryKey: ['tank'], queryFn: async () => (await api.get('/api/tank')).tank });
  const [sheet, setSheet] = useState(null); // 'refill' | 'adjust' | 'personal'
  const [saved, setSaved] = useState('');
  const tank = tankQuery.data;

  const sheetProps = { tank, onClose: () => setSheet(null), onSaved: setSaved };

  return (
    <>
      <PageHeader title="Stok toren" />
      {tankQuery.isPending && <p className="text-muted">Memuat…</p>}
      {tankQuery.isError && <Notice tone="error">{tankQuery.error.message}</Notice>}

      {saved && (
        <Notice tone="ok" role="status" className="mb-4">
          {saved}
        </Notice>
      )}

      {tank && (
        <div className="space-y-5">
          <TankGauge tank={tank} onAdjust={() => setSheet('adjust')} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Button onClick={() => setSheet('refill')} disabled={!tank.known} className="w-full">
              <Droplets className="size-5" aria-hidden="true" />
              Air masuk
            </Button>
            <Button variant="secondary" onClick={() => setSheet('adjust')} className="w-full">
              <SlidersHorizontal className="size-5" aria-hidden="true" />
              Koreksi stok
            </Button>
            <Button variant="secondary" onClick={() => setSheet('personal')} disabled={!tank.known} className="w-full">
              <Home className="size-5" aria-hidden="true" />
              Pakai pribadi
            </Button>
          </div>

          <History />
        </div>
      )}

      {sheet === 'refill' && <RefillSheet {...sheetProps} />}
      {sheet === 'adjust' && <AdjustSheet {...sheetProps} />}
      {sheet === 'personal' && <PersonalUseSheet {...sheetProps} />}
    </>
  );
}

function TankGauge({ tank, onAdjust }) {
  if (!tank.known) {
    return (
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <Gauge className="size-8 shrink-0 text-brand" aria-hidden="true" />
          <h2 className="text-lg font-extrabold text-ink">Stok awal belum diatur</h2>
        </div>
        <p className="text-muted">
          Aplikasi perlu tahu sisa air di toren sekarang sebagai titik awal. Setelah itu sisa air dihitung otomatis dari air masuk dan order.
        </p>
        <Button onClick={onAdjust} className="w-full">
          Atur stok awal
        </Button>
      </Card>
    );
  }

  const tone = TONE[tank.level] ?? 'ok';
  const days = daysLeftText(tank.daysLeft);
  return (
    <Card className="space-y-4">
      {tank.level === 'CRITICAL' && tank.status === 'OK' && <Notice tone="error" role="alert">Air hampir habis. Segera isi toren.</Notice>}
      {tank.level === 'LOW' && <Notice tone="warn" role="alert">Air toren menipis.</Notice>}
      {tank.status === 'NEGATIVE' && (
        <Notice tone="warn" role="alert">
          Pemakaian tercatat melebihi stok. Hitungan tidak cocok dengan keadaan toren, lakukan koreksi stok.
        </Notice>
      )}
      {tank.status === 'OVER_CAPACITY' && (
        <Notice tone="warn" role="alert">
          Hitungan melebihi kapasitas toren. Periksa catatan air masuk atau lakukan koreksi stok.
        </Notice>
      )}

      <div>
        <p className="text-sm font-semibold text-muted">Sisa air</p>
        <p className="text-4xl font-extrabold tracking-tight text-ink">{formatLiters(Math.max(tank.remainingLiters, 0))}</p>
        <p className="text-base text-muted">
          {tank.percent}% dari {formatNumber(tank.capacityLiters)} liter · setara {formatNumber(tank.gallonsLeft)} galon
        </p>
      </div>

      <ProgressBar percent={tank.percent} tone={tone} label="Isi toren" />

      <div className="space-y-1 text-base">
        {days ? (
          <p className="font-semibold text-ink">
            Perkiraan habis {days === 'kurang dari 1 hari' ? days : `${days} lagi`}
            {tank.emptyOn && tank.daysLeft >= 1 && <span className="font-normal text-muted"> (sekitar {formatDate(tank.emptyOn, { day: 'numeric', month: 'long' })})</span>}
          </p>
        ) : (
          <p className="text-muted">Belum ada data pemakaian untuk memperkirakan kapan habis.</p>
        )}
        {tank.avgDailyGallons != null && <p className="text-sm text-muted">Rata-rata terpakai {formatDecimal(tank.avgDailyGallons)} galon per hari (maksimal 7 hari terakhir).</p>}
        <p className="text-sm text-muted">
          Dikoreksi terakhir {formatDateTime(tank.adjustedAt)} ({formatLiters(tank.litersAfterAdjustment)}).
        </p>
      </div>
    </Card>
  );
}

const LABEL = {
  REFILL: (i) => `Air masuk +${formatLiters(i.liters)}`,
  ADJUSTMENT: (i) => `Koreksi stok: sisa ${formatLiters(i.liters)}`,
  PERSONAL: (i) => `Konsumsi pribadi ${i.gallons} galon`,
};
const VOID_PATH = { REFILL: (id) => `/api/tank/refills/${id}`, PERSONAL: (id) => `/api/personal-use/${id}` };

function History() {
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: ['tank-history'], queryFn: async () => (await api.get('/api/tank/history')).items });
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState('');

  const voidItem = useMutation({
    mutationFn: (item) => api.patch(VOID_PATH[item.type](item.id), { voided: true }),
    onSuccess: () => {
      setConfirm(null);
      setError('');
      for (const key of ['tank', 'tank-history', 'summary']) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => setError(err.message),
  });

  const items = history.data ?? [];
  return (
    <Card className="p-0">
      <h2 className="px-5 pt-5 pb-2 text-lg font-extrabold text-ink">Riwayat</h2>
      {error && (
        <Notice tone="error" role="alert" className="mx-5 mb-2">
          {error}
        </Notice>
      )}
      {history.isPending && <p className="px-5 pb-5 text-muted">Memuat…</p>}
      {history.isSuccess && items.length === 0 && <p className="px-5 pb-5 text-muted">Belum ada catatan.</p>}
      <ul className="divide-y divide-line">
        {items.map((item) => {
          const key = `${item.type}-${item.id}`;
          return (
            <li key={key} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold text-ink">{LABEL[item.type](item)}</p>
                  <p className="text-sm text-muted">
                    {formatDateTime(item.at)} · {item.byName}
                  </p>
                  {item.note && <p className="text-sm text-muted">“{item.note}”</p>}
                </div>
                {item.canVoid && confirm !== key && (
                  <Button variant="dangerOutline" className="min-h-11 shrink-0 px-4 text-sm" onClick={() => setConfirm(key)}>
                    Batalkan
                  </Button>
                )}
              </div>
              {confirm === key && (
                <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Konfirmasi pembatalan">
                  <span className="text-sm font-semibold text-ink">Batalkan catatan ini?</span>
                  <Button variant="danger" className="min-h-11 px-4 text-sm" loading={voidItem.isPending} onClick={() => voidItem.mutate(item)}>
                    Ya, batalkan
                  </Button>
                  <Button variant="secondary" className="min-h-11 px-4 text-sm" onClick={() => setConfirm(null)}>
                    Tidak
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
