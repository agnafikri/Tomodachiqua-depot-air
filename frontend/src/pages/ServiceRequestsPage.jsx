import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { AnchorButton, Badge, Button, Card, Notice, PageHeader, Select, Sheet, Textarea, cx } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.mjs';
import { formatDateTime } from '../lib/format.mjs';
import { STATUSES } from '../lib/serviceRequests.mjs';
import { waLink } from '../lib/whatsapp.mjs';

const REFRESH = ['service-requests', 'summary'];

export default function ServiceRequestsPage() {
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState(null);
  const query = useQuery({
    queryKey: ['service-requests', status],
    queryFn: () => api.get(`/api/service-requests${status ? `?status=${status}` : ''}`),
  });
  const data = query.data;
  const opened = data?.requests.find((r) => r.id === openId) ?? null;

  const chips = [{ value: '', label: 'Semua', count: data?.counts.total }, ...Object.entries(STATUSES).map(([value, s]) => ({ value, label: s.label, count: data?.counts[value] }))];

  return (
    <>
      <PageHeader title="Layanan">Permintaan pemasangan dan service dari landing page.</PageHeader>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Saring berdasarkan status">
        {chips.map((c) => (
          <button
            key={c.value || 'all'}
            type="button"
            aria-pressed={status === c.value}
            onClick={() => setStatus(c.value)}
            className={cx(
              'min-h-11 rounded-full border px-4 text-sm font-bold',
              status === c.value ? 'border-brand bg-brand text-white' : 'border-line bg-white text-muted hover:bg-brand-soft',
            )}
          >
            {c.label}
            {c.count != null && ` (${c.count})`}
          </button>
        ))}
      </div>

      {query.isPending && <p className="text-muted">Memuat…</p>}
      {query.isError && <Notice tone="error">{query.error.message}</Notice>}
      {query.isSuccess && data.requests.length === 0 && (
        <Card>
          <p className="text-muted">{status ? 'Tidak ada permintaan dengan status ini.' : 'Belum ada permintaan layanan. Permintaan dari formulir di landing page akan muncul di sini.'}</p>
        </Card>
      )}

      <ul className="space-y-3">
        {(data?.requests ?? []).map((r) => (
          <li key={r.id}>
            <button onClick={() => setOpenId(r.id)} className="block w-full rounded-2xl border border-line bg-white p-4 text-left hover:bg-brand-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-extrabold text-ink">{r.name}</p>
                  <p className="text-sm text-muted">
                    {r.serviceLabel} · {r.areaLabel}
                  </p>
                </div>
                <Badge tone={STATUSES[r.status].tone}>{r.statusLabel}</Badge>
              </div>
              {r.message && <p className="mt-2 line-clamp-2 text-sm text-ink">{r.message}</p>}
              <p className="mt-2 text-xs text-muted">Masuk {formatDateTime(r.createdAt)}</p>
            </button>
          </li>
        ))}
      </ul>

      {opened && <RequestSheet key={opened.id} request={opened} onClose={() => setOpenId(null)} />}
    </>
  );
}

function RequestSheet({ request: r, onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(r.status);
  const [note, setNote] = useState(r.internalNote ?? '');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = () => REFRESH.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));

  const save = useMutation({
    mutationFn: () => api.patch(`/api/service-requests/${r.id}`, { status, internalNote: note }),
    onSuccess: () => {
      setSaved('Perubahan tersimpan.');
      setError('');
      refresh();
    },
    onError: (err) => {
      setSaved('');
      setError(err.message);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/api/service-requests/${r.id}`),
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const message = `Halo ${r.name}, kami dari Tomodachiqua menanggapi permintaan ${r.serviceLabel.toLowerCase()} Anda di ${r.areaLabel}. Kapan waktu yang pas untuk kami hubungi?`;

  return (
    <Sheet open onClose={onClose} title={r.name}>
      <div className="space-y-4">
        <dl className="space-y-2 text-base">
          <Info label="Layanan" value={`${r.serviceLabel} · ${r.areaLabel}`} />
          <Info label="WhatsApp" value={<a href={`tel:+${r.phone}`} className="font-semibold text-brand underline underline-offset-4">{`+${r.phone}`}</a>} />
          {r.address && <Info label="Alamat" value={r.address} />}
          {r.message && <Info label="Pesan" value={<span className="whitespace-pre-wrap">{r.message}</span>} />}
          <Info label="Masuk" value={formatDateTime(r.createdAt)} />
          {r.contactedAt && <Info label="Pertama dihubungi" value={formatDateTime(r.contactedAt)} />}
        </dl>

        <AnchorButton href={waLink(r.phone, message)} className="w-full">
          <MessageCircle className="size-5" aria-hidden="true" />
          Hubungi via WhatsApp
        </AnchorButton>

        <div className="space-y-4 border-t border-line pt-4">
          {saved && (
            <Notice tone="ok" role="status">
              {saved}
            </Notice>
          )}
          {error && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={Object.entries(STATUSES).map(([value, s]) => ({ value, label: s.label }))} />
          <Textarea label="Catatan internal (tidak terlihat pengunjung)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Mis. sudah ditelepon, survei hari Sabtu" />
          <Button onClick={() => save.mutate()} loading={save.isPending} className="w-full">
            {save.isPending ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>

        {user.role === 'ADMIN' && (
          <div className="border-t border-line pt-4">
            {!confirmDelete ? (
              <Button variant="dangerOutline" className="min-h-11 px-4 text-sm" onClick={() => setConfirmDelete(true)}>
                Hapus permanen
              </Button>
            ) : (
              <div className="space-y-2" role="group" aria-label="Konfirmasi hapus">
                <p className="text-sm font-semibold text-ink">Hapus permintaan ini selamanya? Data tidak bisa dikembalikan.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" className="min-h-11 px-4 text-sm" loading={remove.isPending} onClick={() => remove.mutate()}>
                    Ya, hapus
                  </Button>
                  <Button variant="secondary" className="min-h-11 px-4 text-sm" onClick={() => setConfirmDelete(false)}>
                    Tidak
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-base font-semibold text-ink">{value}</dd>
    </div>
  );
}
