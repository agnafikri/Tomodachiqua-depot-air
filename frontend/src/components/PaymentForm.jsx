import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Input, Notice } from './ui.jsx';
import { api } from '../lib/api.mjs';
import { digitsOnly, formatRupiah, newRequestId } from '../lib/format.mjs';
import { fieldErrorsFrom } from '../lib/hooks.mjs';

// Kalimat hasil pembayaran, dipakai juga oleh layar yang menggantikan formulir saat utang sudah lunas.
export function paymentMessage(done) {
  return [
    `Pembayaran ${formatRupiah(done.amount)} tersimpan.`,
    done.waived > 0 ? `Sisa ${formatRupiah(done.waived)} dianggap lunas.` : '',
    done.remainingDebt === 0 ? 'Utang lunas.' : done.remainingDebt != null ? `Sisa utang ${formatRupiah(done.remainingDebt)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

// Pembayaran utang. target = { customerId } (alokasi ke order tertua dulu) atau { orderId } (satu order).
// Bila jumlah yang dibayar kurang dari sisa utang, Pemilik boleh menganggap sisanya lunas (keringanan)
// dengan catatan alasan; sisa itu tidak dihitung sebagai uang masuk.
export default function PaymentForm({ target, outstanding, onPaid }) {
  const queryClient = useQueryClient();
  const [amountText, setAmountText] = useState('');
  const [waive, setWaive] = useState(false);
  const [note, setNote] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);

  const amount = amountText === '' ? null : Number.parseInt(amountText, 10);
  const canWaive = amount != null && amount >= 1 && amount < outstanding;
  const waiving = waive && canWaive;
  const shortfall = canWaive ? outstanding - amount : 0;

  const pay = useMutation({
    mutationFn: () =>
      api.post('/api/payments', {
        ...target,
        amount,
        ...(waiving ? { waiveRemaining: true, note: note.trim() } : {}),
        clientRequestId: requestId,
      }),
    onSuccess: ({ payment }) => {
      setDone(payment);
      setAmountText('');
      setWaive(false);
      setNote('');
      setError('');
      setErrors({});
      setRequestId(newRequestId());
      for (const key of ['debts', 'debt-customer', 'orders', 'summary']) queryClient.invalidateQueries({ queryKey: [key] });
      onPaid?.(payment);
    },
    // requestId tidak diganti saat gagal: kirim ulang tidak membuat pembayaran ganda.
    onError: (err) => {
      setDone(null);
      if (err.code === 'VALIDATION_ERROR') setErrors(fieldErrorsFrom(err));
      else setError(err.message);
    },
  });

  function submit(e) {
    e.preventDefault();
    setError('');
    setErrors({});
    if (!amount || amount < 1) return setErrors({ amount: 'Isi jumlah yang dibayar.' });
    if (amount > outstanding) return setErrors({ amount: `Jumlah melebihi sisa utang (${formatRupiah(outstanding)}).` });
    if (waiving && !note.trim()) return setErrors({ note: 'Isi catatan alasan keringanan.' });
    return pay.mutate();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {done && (
        <Notice tone="ok" role="status">
          {paymentMessage(done)}
        </Notice>
      )}
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <Input
        label="Jumlah dibayar (Rp)"
        inputMode="numeric"
        value={amountText}
        onChange={(e) => setAmountText(digitsOnly(e.target.value).slice(0, 10))}
        error={errors.amount}
        hint={amount ? formatRupiah(amount) : undefined}
      />

      {canWaive && (
        <div className="rounded-2xl bg-canvas p-3">
          <Checkbox
            label={`Anggap lunas (sisa ${formatRupiah(shortfall)} dimaafkan)`}
            hint="Sisa tidak ditagih lagi dan dicatat sebagai keringanan, bukan uang masuk."
            checked={waive}
            onChange={(e) => setWaive(e.target.checked)}
          />
          {waive && (
            <Input
              className="mt-2"
              label="Catatan alasan (wajib)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              error={errors.note}
              maxLength={200}
              placeholder="Mis. hanya bawa segini"
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="secondary" className="sm:flex-1" onClick={() => setAmountText(String(outstanding))}>
          Lunasi semua
        </Button>
        <Button type="submit" loading={pay.isPending} className="sm:flex-1">
          {pay.isPending ? 'Menyimpan…' : waiving ? 'Catat dan anggap lunas' : 'Catat pembayaran'}
        </Button>
      </div>
    </form>
  );
}
