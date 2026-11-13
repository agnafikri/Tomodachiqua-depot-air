import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import DownloadButton from '../components/DownloadButton.jsx';
import { Badge, Button, Card, Input, Notice, PageHeader, Segmented } from '../components/ui.jsx';
import { api } from '../lib/api.mjs';
import { formatDateTime, formatNumber, formatRupiah } from '../lib/format.mjs';

const KINDS = [
  { value: 'pelanggan', label: 'Pelanggan', hint: 'Daftar pelanggan beserta harga khusus dan diskon paket.' },
  { value: 'order', label: 'Order lama', hint: 'Riwayat order dan utang berjalan. Harga dihitung otomatis; impor Pelanggan lebih dulu.' },
  { value: 'pengeluaran', label: 'Pengeluaran', hint: 'Pengeluaran usaha (kecuali upah, yang dicatat lewat menu Upah).' },
];

const REFRESH_AFTER_IMPORT = ['import-batches', 'customers', 'orders', 'debts', 'debt-customer', 'report', 'finance', 'expenses', 'summary', 'tank'];

export default function ImportExportPage() {
  return (
    <>
      <PageHeader title="Impor dan ekspor">Cadangan data, laporan Excel, dan impor data lama. Khusus admin.</PageHeader>
      <div className="space-y-6">
        <ExportSection />
        <ImportSection />
        <BatchHistory />
      </div>
    </>
  );
}

function ExportSection() {
  const [period, setPeriod] = useState('monthly');
  const [date, setDate] = useState('');
  return (
    <Card className="space-y-5">
      <h2 className="text-xl font-extrabold text-ink">Ekspor ke Excel</h2>

      <div className="space-y-3">
        <h3 className="text-base font-bold text-ink">Laporan periode</h3>
        <Segmented
          label="Periode"
          hideLabel
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'daily', label: 'Harian' },
            { value: 'weekly', label: 'Mingguan' },
            { value: 'monthly', label: 'Bulanan' },
          ]}
        />
        <Input label="Tanggal acuan (kosong = hari ini)" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <DownloadButton path={`/api/export/report.xlsx?period=${period}${date ? `&date=${date}` : ''}`}>Unduh laporan Excel</DownloadButton>
        <p className="text-sm text-muted">Berisi ringkasan, order, pembayaran, keringanan, pengeluaran, upah, dan utang saat ini.</p>
      </div>

      <div className="space-y-3 border-t border-line pt-5">
        <h3 className="text-base font-bold text-ink">Cadangan lengkap</h3>
        <DownloadButton path="/api/export/backup.xlsx">Unduh cadangan lengkap (Excel)</DownloadButton>
        <p className="text-sm text-muted">
          Semua data sepanjang waktu, termasuk yang dibatalkan. Simpan salinannya di luar layanan (mis. Google Drive), misalnya sebulan sekali.
          Akun dan password tidak disertakan.
        </p>
      </div>
    </Card>
  );
}

function ImportSection() {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [slug, setSlug] = useState('pelanggan');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [imported, setImported] = useState(null);
  const kind = KINDS.find((k) => k.value === slug);

  const reset = () => {
    setFile(null);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const form = () => {
    const f = new FormData();
    f.append('file', file);
    return f;
  };

  const checkFile = useMutation({
    mutationFn: () => api.upload(`/api/import/${slug}/check`, form()),
    onSuccess: ({ result: r }) => {
      setResult(r);
      setError('');
      setImported(null);
    },
    onError: (err) => {
      setResult(null);
      setError(err.message);
    },
  });

  const saveFile = useMutation({
    mutationFn: () => api.upload(`/api/import/${slug}`, form()),
    onSuccess: ({ import: done }) => {
      setImported(done);
      reset();
      for (const key of REFRESH_AFTER_IMPORT) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => setError(err.message),
  });

  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-extrabold text-ink">Impor dari Excel</h2>
      <Segmented
        label="Jenis data"
        value={slug}
        onChange={(v) => {
          setSlug(v);
          reset();
          setImported(null);
        }}
        options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
      />
      <p className="text-sm text-muted">{kind.hint}</p>
      <DownloadButton path={`/api/import/templates/${slug}`}>Unduh template {kind.label}</DownloadButton>

      <div className="space-y-2 border-t border-line pt-4">
        <p className="text-sm font-semibold text-ink">Berkas Excel yang sudah diisi</p>
        <input
          ref={inputRef}
          id="import-file"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="Pilih berkas Excel"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError('');
            setImported(null);
          }}
        />
        <label
          htmlFor="import-file"
          className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand-line bg-brand-soft px-4 text-base font-bold text-brand-dark hover:bg-brand-line/40"
        >
          <FileSpreadsheet className="size-5" aria-hidden="true" />
          {file ? 'Ganti berkas' : 'Pilih berkas Excel (.xlsx)'}
        </label>
        {file && (
          <p className="text-sm text-muted">
            {file.name} · {formatNumber(Math.max(1, Math.round(file.size / 1024)))} KB
          </p>
        )}
        <Button type="button" onClick={() => checkFile.mutate()} disabled={!file} loading={checkFile.isPending} className="w-full">
          <Upload className="size-5" aria-hidden="true" />
          {checkFile.isPending ? 'Memeriksa…' : 'Periksa file'}
        </Button>
      </div>

      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {imported && (
        <Notice tone="ok" role="status">
          {imported.imported} baris berhasil diimpor.
        </Notice>
      )}

      {result && (
        <>
          <ImportResult result={result} />
          <Button type="button" onClick={() => saveFile.mutate()} disabled={!result.canCommit} loading={saveFile.isPending} className="w-full">
            {saveFile.isPending ? 'Menyimpan…' : 'Simpan impor'}
          </Button>
          {!result.canCommit && <p className="text-sm text-muted">Tombol Simpan aktif setelah semua galat diperbaiki dan berkas diperiksa ulang.</p>}
        </>
      )}
    </Card>
  );
}

function SummaryLines({ kind, s }) {
  const lines =
    kind === 'CUSTOMERS'
      ? [`${s.count} pelanggan`, `${s.withCustomPrice} dengan harga khusus`, `${s.withBundle} dengan diskon paket`, `${s.inactive} nonaktif`]
      : kind === 'ORDERS'
        ? [
            `${s.count} order · ${formatNumber(s.gallons)} galon · nilai ${formatRupiah(s.totalValue)}`,
            `Dibayar saat order ${formatRupiah(s.paidAtOrder)} · menjadi utang ${formatRupiah(s.unpaid)}`,
            `${s.paidCount} lunas · ${s.debtCount} utang · tanggal ${s.dateFrom} s.d. ${s.dateTo}`,
          ]
        : [`${s.count} pengeluaran · total ${formatRupiah(s.total)}`, `Tanggal ${s.dateFrom} s.d. ${s.dateTo}`];
  return (
    <ul className="space-y-0.5 text-base text-ink">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

const PREVIEW_COLUMNS = {
  CUSTOMERS: [['Nama', (r) => r.name], ['Harga khusus', (r) => (r.customPrice ? formatRupiah(r.customPrice) : '-')], ['Paket', (r) => r.bundle ?? '-'], ['Aktif', (r) => (r.isActive ? 'Ya' : 'Tidak')]],
  ORDERS: [['Tanggal', (r) => `${r.date} ${r.time}`], ['Pelanggan', (r) => r.customer], ['Galon', (r) => r.qty], ['Harga', (r) => formatRupiah(r.unitPrice)], ['Total', (r) => formatRupiah(r.total)], ['Status', (r) => (r.status === 'PAID' ? 'Lunas' : r.paid > 0 ? `Utang (dibayar ${formatRupiah(r.paid)})` : 'Utang')]],
  EXPENSES: [['Tanggal', (r) => r.date], ['Kategori', (r) => r.category], ['Jumlah', (r) => formatRupiah(r.amount)], ['Catatan', (r) => r.note ?? '']],
};

function ImportResult({ result: r }) {
  return (
    <div className="space-y-4" aria-live="polite">
      <p className="text-base font-bold text-ink">
        {r.rowCount} baris dibaca · {r.validCount} valid · {r.errorCount} bermasalah
      </p>

      {r.alreadyImported && (
        <Notice tone="warn" role="alert">
          Berkas yang sama sudah pernah diimpor pada {formatDateTime(r.alreadyImported.at)}. Batalkan impor sebelumnya (di riwayat impor) jika ingin mengulang.
        </Notice>
      )}
      {r.warnings.map((w) => (
        <Notice key={w} tone="warn">
          {w}
        </Notice>
      ))}

      {r.errors.length > 0 && (
        <section aria-label="Galat per baris">
          <h3 className="mb-2 text-base font-extrabold text-danger">Perlu diperbaiki</h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {r.errors.map((e, i) => (
              <li key={`${e.row}-${e.column}-${i}`} className="px-3 py-2">
                <p className="text-sm font-bold text-ink">
                  Baris {e.row} · {e.column}
                </p>
                <p className="text-sm text-danger">{e.message}</p>
              </li>
            ))}
          </ul>
          {r.errorsTruncated && <p className="mt-1 text-sm text-muted">Hanya sebagian galat yang ditampilkan. Perbaiki lalu periksa ulang untuk melihat sisanya.</p>}
        </section>
      )}

      {r.validCount > 0 && (
        <section aria-label="Ringkasan" className="space-y-3">
          <h3 className="text-base font-extrabold text-ink">{r.errors.length ? 'Baris yang valid' : 'Ringkasan'}</h3>
          <SummaryLines kind={r.kind} s={r.summary} />
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-canvas text-muted">
                <tr>
                  {PREVIEW_COLUMNS[r.kind].map(([h]) => (
                    <th key={h} className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.preview.map((row, i) => (
                  <tr key={i}>
                    {PREVIEW_COLUMNS[r.kind].map(([h, get]) => (
                      <td key={h} className="px-3 py-2 text-ink">
                        {get(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.validCount > r.preview.length && <p className="text-sm text-muted">Menampilkan {r.preview.length} baris pertama.</p>}
        </section>
      )}

      {r.canCommit && <Notice tone="ok">Berkas siap diimpor. Periksa ringkasan di atas, lalu tekan Simpan impor.</Notice>}
    </div>
  );
}

function BatchHistory() {
  const queryClient = useQueryClient();
  const batches = useQuery({ queryKey: ['import-batches'], queryFn: async () => (await api.get('/api/import/batches')).batches });
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const undo = useMutation({
    mutationFn: (id) => api.patch(`/api/import/batches/${id}`, { voided: true }),
    onSuccess: (r) => {
      setConfirmId(null);
      setError('');
      setMessage(`Impor dibatalkan: ${r.voidedOrders} order dan ${r.voidedExpenses} pengeluaran ditandai batal.`);
      for (const key of REFRESH_AFTER_IMPORT) queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => setError(err.message),
  });

  const list = batches.data ?? [];
  return (
    <Card className="p-0">
      <h2 className="px-5 pt-5 pb-2 text-xl font-extrabold text-ink">Riwayat impor</h2>
      {message && (
        <Notice tone="ok" role="status" className="mx-5 mb-2">
          {message}
        </Notice>
      )}
      {error && (
        <Notice tone="error" role="alert" className="mx-5 mb-2">
          {error}
        </Notice>
      )}
      {batches.isPending && <p className="px-5 pb-5 text-muted">Memuat…</p>}
      {batches.isSuccess && list.length === 0 && <p className="px-5 pb-5 text-muted">Belum ada impor.</p>}
      <ul className="divide-y divide-line">
        {list.map((b) => (
          <li key={b.id} className="px-5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-ink">
                  {b.kindLabel} · {b.rowCount} baris
                </p>
                <p className="truncate text-sm text-muted">{b.fileName}</p>
                <p className="text-sm text-muted">
                  {formatDateTime(b.createdAt)} · {b.byName}
                </p>
              </div>
              {b.voidedAt && <Badge tone="danger">Dibatalkan</Badge>}
            </div>
            {!b.voidedAt && confirmId !== b.id && (
              <Button variant="dangerOutline" className="mt-2 min-h-11 px-4 text-sm" onClick={() => setConfirmId(b.id)}>
                Batalkan impor
              </Button>
            )}
            {confirmId === b.id && (
              <div className="mt-2 space-y-2" role="group" aria-label="Konfirmasi pembatalan impor">
                <p className="text-sm font-semibold text-ink">
                  Order, pembayaran, dan pengeluaran dari impor ini akan ditandai batal. Pelanggan yang sudah diimpor tidak dihapus. Lanjutkan?
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" className="min-h-11 px-4 text-sm" loading={undo.isPending} onClick={() => undo.mutate(b.id)}>
                    Ya, batalkan impor
                  </Button>
                  <Button variant="secondary" className="min-h-11 px-4 text-sm" onClick={() => setConfirmId(null)}>
                    Tidak
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
