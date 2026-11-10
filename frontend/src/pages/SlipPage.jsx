import { useQuery } from '@tanstack/react-query';
import { Printer, Share2 } from 'lucide-react';
import { Button, Card, LinkButton, Notice } from '../components/ui.jsx';
import { DropMark } from '../components/Ripples.jsx';
import { api } from '../lib/api.mjs';
import { formatDate, formatDateTime, formatRupiah } from '../lib/format.mjs';
import { useParams } from 'react-router-dom';

const longDate = (v) => formatDate(`${v}T00:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Teks slip untuk dibagikan (mis. lewat WhatsApp).
export function slipText(s) {
  return [
    'SLIP UPAH HARIAN',
    'Tomodachiqua - Depot Air Isi Ulang',
    `No. ${s.id}`,
    `Tanggal: ${longDate(s.wageDate)}`,
    `Nama: ${s.employeeName}`,
    `Upah: ${formatRupiah(s.amount)}`,
    s.note ? `Catatan: ${s.note}` : null,
    `Dicatat oleh: ${s.byName}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function shareSlip(s) {
  const text = slipText(s);
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: 'Slip upah harian', text });
    } catch {
      /* dibatalkan pengguna */
    }
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

export default function SlipPage() {
  const { id } = useParams();
  const slip = useQuery({ queryKey: ['wage-slip', id], queryFn: async () => (await api.get(`/api/wages/slips/${id}`)).slip });
  const s = slip.data;

  return (
    <>
      <div className="mb-4 print:hidden">
        <LinkButton to="/upah">Kembali ke Upah</LinkButton>
      </div>

      {slip.isPending && <p className="text-muted">Memuat…</p>}
      {slip.isError && <Notice tone="error">{slip.error.message}</Notice>}

      {s && (
        <>
          <Card className="mx-auto max-w-md space-y-5 print:max-w-none print:rounded-none print:border-ink">
            <header className="flex items-center gap-3 border-b border-line pb-4">
              <DropMark className="size-11 print:hidden" />
              <div>
                <p className="text-lg font-extrabold leading-tight text-brand-deep">Tomodachiqua</p>
                <p className="text-sm text-muted">Depot Air Isi Ulang</p>
              </div>
            </header>

            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-ink">Slip Upah Harian</h1>
              <p className="text-sm text-muted">No. {s.id}</p>
            </div>

            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-muted">Tanggal</dt>
                <dd className="text-base font-bold text-ink">{longDate(s.wageDate)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Nama karyawan</dt>
                <dd className="text-base font-bold text-ink">{s.employeeName}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Upah diterima</dt>
                <dd className="text-3xl font-extrabold tracking-tight text-brand-deep">{formatRupiah(s.amount)}</dd>
              </div>
              {s.note && (
                <div>
                  <dt className="text-sm text-muted">Catatan</dt>
                  <dd className="text-base text-ink">{s.note}</dd>
                </div>
              )}
            </dl>

            <p className="text-sm text-muted">
              Dicatat oleh {s.byName} · {formatDateTime(s.createdAt)}
            </p>

            <div className="grid grid-cols-2 gap-6 pt-6 text-center text-sm text-muted">
              <div>
                <div className="mb-1 h-14 border-b border-ink" />
                Penerima
              </div>
              <div>
                <div className="mb-1 h-14 border-b border-ink" />
                Pemilik
              </div>
            </div>
          </Card>

          <div className="mx-auto mt-4 flex max-w-md flex-col gap-2 print:hidden sm:flex-row">
            <Button onClick={() => window.print()} className="sm:flex-1">
              <Printer className="size-5" aria-hidden="true" />
              Cetak / simpan PDF
            </Button>
            <Button variant="secondary" onClick={() => shareSlip(s)} className="sm:flex-1">
              <Share2 className="size-5" aria-hidden="true" />
              Bagikan
            </Button>
          </div>
        </>
      )}
    </>
  );
}
