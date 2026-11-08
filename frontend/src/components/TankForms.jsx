import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Notice, Sheet } from './ui.jsx';
import { api } from '../lib/api.mjs';
import { digitsOnly, formatLiters, formatNumber, newRequestId } from '../lib/format.mjs';
import { fieldErrorsFrom } from '../lib/hooks.mjs';

// Dasar tiga formulir stok. requestId dibuat sekali per formulir dan tidak diganti saat gagal,
// jadi kirim ulang setelah koneksi putus tidak membuat catatan ganda.
function useRecord(path, onDone) {
  const queryClient = useQueryClient();
  const [requestId] = useState(newRequestId);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const mutation = useMutation({
    mutationFn: (body) => api.post(path, { ...body, clientRequestId: requestId }),
    onSuccess: () => {
      for (const key of ['tank', 'tank-history', 'summary']) queryClient.invalidateQueries({ queryKey: [key] });
      onDone();
    },
    onError: (err) => {
      if (err.code === 'VALIDATION_ERROR') {
        setFieldErrors(fieldErrorsFrom(err));
        setError('');
      } else {
        setError(err.message);
      }
    },
  });

  return {
    error,
    fieldErrors,
    setFieldErrors,
    pending: mutation.isPending,
    submit(body) {
      setError('');
      setFieldErrors({});
      mutation.mutate(body);
    },
  };
}

function DateField({ value, onChange, max, error, label }) {
  return <Input label={label} type="date" value={value} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} error={error} />;
}

function FormShell({ onSubmit, error, children, pending, submitLabel }) {
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {children}
      <Button type="submit" loading={pending} className="w-full">
        {pending ? 'Menyimpan…' : submitLabel}
      </Button>
    </form>
  );
}

export function RefillSheet({ tank, onClose, onSaved }) {
  const [liters, setLiters] = useState('');
  const [date, setDate] = useState(tank.today);
  const [note, setNote] = useState('');
  const rec = useRecord('/api/tank/refills', () => {
    onSaved('Air masuk tersimpan.');
    onClose();
  });

  function submit(e) {
    e.preventDefault();
    const n = Number.parseInt(liters, 10);
    if (!n || n < 1) return rec.setFieldErrors({ liters: 'Isi jumlah liter yang masuk.' });
    if (n > tank.capacityLiters) return rec.setFieldErrors({ liters: `Tidak mungkin lebih dari kapasitas toren (${formatLiters(tank.capacityLiters)}).` });
    return rec.submit({ liters: n, refillDate: date, note });
  }

  return (
    <Sheet open onClose={onClose} title="Air masuk">
      <FormShell onSubmit={submit} error={rec.error} pending={rec.pending} submitLabel="Simpan air masuk">
        <Input
          label="Jumlah air masuk (liter)"
          inputMode="numeric"
          value={liters}
          onChange={(e) => setLiters(digitsOnly(e.target.value).slice(0, 5))}
          error={rec.fieldErrors.liters}
          hint={liters ? formatLiters(Number(liters)) : undefined}
        />
        <DateField label="Tanggal" value={date} onChange={setDate} max={tank.today} error={rec.fieldErrors.refillDate} />
        <Input label="Catatan (boleh kosong)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Mis. truk air PDAM" />
      </FormShell>
    </Sheet>
  );
}

export function AdjustSheet({ tank, onClose, onSaved }) {
  const [liters, setLiters] = useState('');
  const [note, setNote] = useState('');
  const rec = useRecord('/api/tank/adjustments', () => {
    onSaved('Koreksi stok tersimpan.');
    onClose();
  });

  function submit(e) {
    e.preventDefault();
    if (liters === '') return rec.setFieldErrors({ litersAfter: 'Isi sisa air di toren sekarang.' });
    const n = Number.parseInt(liters, 10);
    if (n > tank.capacityLiters) return rec.setFieldErrors({ litersAfter: `Tidak mungkin lebih dari kapasitas toren (${formatLiters(tank.capacityLiters)}).` });
    return rec.submit({ litersAfter: n, note });
  }

  return (
    <Sheet open onClose={onClose} title={tank.known ? 'Koreksi stok' : 'Atur stok awal'}>
      <FormShell onSubmit={submit} error={rec.error} pending={rec.pending} submitLabel="Simpan koreksi">
        <p className="text-sm text-muted">
          Isi sisa air di toren saat ini sesuai ukuran sebenarnya. Angka ini menjadi titik awal hitungan baru.
        </p>
        <Input
          label="Sisa air sekarang (liter)"
          inputMode="numeric"
          value={liters}
          onChange={(e) => setLiters(digitsOnly(e.target.value).slice(0, 5))}
          error={rec.fieldErrors.litersAfter}
          hint={liters !== '' ? formatLiters(Number(liters)) : undefined}
        />
        <Button type="button" variant="secondary" className="w-full" onClick={() => setLiters(String(tank.capacityLiters))}>
          Toren penuh ({formatNumber(tank.capacityLiters)} liter)
        </Button>
        <Input label="Catatan (boleh kosong)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Mis. diukur langsung" />
      </FormShell>
    </Sheet>
  );
}

export function PersonalUseSheet({ tank, onClose, onSaved }) {
  const [gallons, setGallons] = useState('1');
  const [date, setDate] = useState(tank.today);
  const [note, setNote] = useState('');
  const rec = useRecord('/api/personal-use', () => {
    onSaved('Konsumsi pribadi tersimpan.');
    onClose();
  });

  function submit(e) {
    e.preventDefault();
    const n = Number.parseInt(gallons, 10);
    if (!n || n < 1) return rec.setFieldErrors({ gallons: 'Isi jumlah galon.' });
    return rec.submit({ gallons: n, useDate: date, note });
  }

  return (
    <Sheet open onClose={onClose} title="Konsumsi pribadi">
      <FormShell onSubmit={submit} error={rec.error} pending={rec.pending} submitLabel="Simpan">
        <p className="text-sm text-muted">Air untuk pemakaian sendiri. Mengurangi stok, tidak dihitung sebagai pendapatan.</p>
        <Input
          label="Jumlah galon"
          inputMode="numeric"
          value={gallons}
          onChange={(e) => setGallons(digitsOnly(e.target.value).slice(0, 3))}
          error={rec.fieldErrors.gallons}
          hint={gallons ? `${formatLiters(Number(gallons) * tank.litersPerGallon)}` : undefined}
        />
        <DateField label="Tanggal" value={date} onChange={setDate} max={tank.today} error={rec.fieldErrors.useDate} />
        <Input label="Catatan (boleh kosong)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Mis. cuci motor" />
      </FormShell>
    </Sheet>
  );
}
