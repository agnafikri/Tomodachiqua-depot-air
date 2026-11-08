import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Notice } from './ui.jsx';
import { api } from '../lib/api.mjs';
import { digitsOnly, formatRupiah, newRequestId } from '../lib/format.mjs';
import { fieldErrorsFrom } from '../lib/hooks.mjs';

// Pembayaran utang. target = { customerId } (alokasi ke order tertua dulu) atau { orderId } (satu order).
export default function PaymentForm({ target, outstanding, onPaid }) {
  const queryClient = useQueryClient();
  const [amountText, setAmountText] = useState('');
  const [requestId, setRequestId] = useState(newRequestId);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [done, setDone] = useState(null);

  const amount = amountText === '' ? null : Number.parseInt(amountText, 10);

  const pay = useMutation({
    mutationFn: () => api.post('/api/payments', { ...target, amount, clientRequestId: requestId }),
    onSuccess: ({ payment }) => {
      setDone(payment);
      setAmountText('');
      setError('');
      setFieldError('');
      setRequestId(newRequestId());
      for (const key of ['debts', 'debt-customer', 'orders', 'summary']) queryClient.invalidateQueries({ queryKey: [key] });
      onPaid?.(payment);
    },
    // requestId tidak diganti saat gagal: kirim ulang tidak membuat pembayaran ganda.
    onError: (err) => {
      setDone(null);
      if (err.code === 'VALIDATION_ERROR') setFieldError(Object.values(fieldErrorsFrom(err))[0] ?? err.message);
      else setError(err.message);
    },
  });

  function submit(e) {
    e.preventDefault();
    setError('');
    setFieldError('');
    if (!amount || amount < 1) return setFieldError('Isi jumlah yang dibayar.');
    if (amount > outstanding) return setFieldError(`Jumlah melebihi sisa utang (${formatRupiah(outstanding)}).`);
    return pay.mutate();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {done && (
        <Notice tone="ok" role="status">
          Pembayaran {formatRupiah(done.amount)} tersimpan.{' '}
          {done.remainingDebt === 0 ? 'Utang lunas.' : done.remainingDebt != null ? `Sisa utang ${formatRupiah(done.remainingDebt)}.` : ''}
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
        error={fieldError}
        hint={amount ? formatRupiah(amount) : undefined}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="secondary" className="sm:flex-1" onClick={() => setAmountText(String(outstanding))}>
          Lunasi semua
        </Button>
        <Button type="submit" loading={pay.isPending} className="sm:flex-1">
          {pay.isPending ? 'Menyimpan…' : 'Catat pembayaran'}
        </Button>
      </div>
    </form>
  );
}
