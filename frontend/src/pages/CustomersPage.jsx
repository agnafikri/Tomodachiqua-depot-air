import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { customerTags } from '../components/CustomerPicker.jsx';
import { Badge, Button, Checkbox, Input, Notice, PageHeader, Sheet } from '../components/ui.jsx';
import { api } from '../lib/api.mjs';
import { digitsOnly, formatRupiah } from '../lib/format.mjs';
import { fieldErrorsFrom, useCustomers } from '../lib/hooks.mjs';

export default function CustomersPage() {
  const customers = useCustomers();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(undefined); // undefined = tertutup, null = baru, objek = ubah

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (customers.data ?? []).filter(
      (c) => (showInactive || c.isActive) && (!q || c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q) || (c.address ?? '').toLowerCase().includes(q)),
    );
  }, [customers.data, search, showInactive]);

  return (
    <>
      <PageHeader title="Pelanggan">Harga khusus dan diskon paket diatur per pelanggan.</PageHeader>

      <div className="mb-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            aria-label="Cari pelanggan"
            placeholder="Cari nama, telepon, atau alamat"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block min-h-12 w-full rounded-xl border border-line bg-white pr-4 pl-12 text-base"
          />
        </div>
        <Button onClick={() => setEditing(null)} className="shrink-0">
          <Plus className="size-5" aria-hidden="true" />
          Tambah
        </Button>
      </div>

      <Checkbox label="Tampilkan yang nonaktif" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="mb-2" />

      {customers.isPending && <p className="text-muted">Memuat…</p>}
      {customers.isError && <Notice tone="error">{customers.error.message}</Notice>}
      {customers.isSuccess && list.length === 0 && (
        <p className="rounded-2xl border border-line bg-white p-5 text-muted">
          {customers.data.length === 0 ? 'Belum ada pelanggan. Ketuk Tambah untuk membuat yang pertama.' : 'Tidak ada pelanggan yang cocok.'}
        </p>
      )}

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white empty:hidden">
        {list.map((c) => (
          <li key={c.id}>
            <button onClick={() => setEditing(c)} className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-soft">
              <span className="min-w-0">
                <span className="block truncate text-base font-bold text-ink">{c.name}</span>
                <span className="block truncate text-sm text-muted">{[c.phone, c.address].filter(Boolean).join(' · ') || 'Tanpa kontak'}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {!c.isActive && <Badge tone="danger">Nonaktif</Badge>}
                {customerTags(c).map((t) => (
                  <Badge key={t} tone="brand">
                    {t}
                  </Badge>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <CustomerSheet key={editing === undefined ? 'closed' : (editing?.id ?? 'new')} customer={editing} onClose={() => setEditing(undefined)} />
    </>
  );
}

function CustomerSheet({ customer, onClose }) {
  const open = customer !== undefined;
  const isEdit = Boolean(customer);
  const queryClient = useQueryClient();

  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [customPrice, setCustomPrice] = useState(customer?.customPrice ? String(customer.customPrice) : '');
  const [hasBundle, setHasBundle] = useState(Boolean(customer?.bundleBuy));
  const [bundleBuy, setBundleBuy] = useState(customer?.bundleBuy ? String(customer.bundleBuy) : '10');
  const [bundlePay, setBundlePay] = useState(customer?.bundlePay ? String(customer.bundlePay) : '9');
  const [isActive, setIsActive] = useState(customer?.isActive ?? true);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const save = useMutation({
    mutationFn: (body) => (isEdit ? api.patch(`/api/customers/${customer.id}`, body) : api.post('/api/customers', body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (err) => {
      if (err.code === 'VALIDATION_ERROR') {
        setErrors(fieldErrorsFrom(err));
        setFormError('');
      } else if (err.code === 'DUPLICATE_NAME') {
        setErrors({ name: err.message });
        setFormError('');
      } else {
        setFormError(err.message);
      }
    },
  });

  function submit(e) {
    e.preventDefault();
    const next = {};
    if (!name.trim()) next.name = 'Nama wajib diisi.';
    if (customPrice !== '' && Number(customPrice) < 1) next.customPrice = 'Harga minimal Rp 1.';
    const buy = Number(bundleBuy);
    const pay = Number(bundlePay);
    if (hasBundle) {
      if (!buy || !pay) next.bundleBuy = 'Isi jumlah beli dan bayar.';
      else if (pay >= buy) next.bundlePay = 'Jumlah bayar harus lebih kecil dari jumlah beli.';
    }
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;

    save.mutate({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      customPrice: customPrice === '' ? null : Number(customPrice),
      bundleBuy: hasBundle ? buy : null,
      bundlePay: hasBundle ? pay : null,
      ...(isEdit ? { isActive } : {}),
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={isEdit ? 'Ubah pelanggan' : 'Pelanggan baru'}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && (
          <Notice tone="error" role="alert">
            {formError}
          </Notice>
        )}
        <Input label="Nama" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={100} autoComplete="off" />
        <Input label="Telepon (boleh kosong)" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} maxLength={30} />
        <Input label="Alamat (boleh kosong)" value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} maxLength={300} />
        <Input
          label="Harga khusus per galon (boleh kosong)"
          inputMode="numeric"
          value={customPrice}
          onChange={(e) => setCustomPrice(digitsOnly(e.target.value).slice(0, 7))}
          error={errors.customPrice}
          hint={customPrice ? `${formatRupiah(Number(customPrice))} per galon, sama untuk diantar maupun diambil.` : 'Kosong = harga standar (Rp 5.000 diambil, Rp 6.000 diantar).'}
        />

        <div className="rounded-2xl bg-canvas p-3">
          <Checkbox label="Diskon paket" hint="Contoh: beli 10 bayar 9" checked={hasBundle} onChange={(e) => setHasBundle(e.target.checked)} />
          {hasBundle && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Input label="Beli (galon)" inputMode="numeric" value={bundleBuy} onChange={(e) => setBundleBuy(digitsOnly(e.target.value).slice(0, 4))} error={errors.bundleBuy} />
              <Input label="Bayar (galon)" inputMode="numeric" value={bundlePay} onChange={(e) => setBundlePay(digitsOnly(e.target.value).slice(0, 4))} error={errors.bundlePay} />
            </div>
          )}
        </div>

        {isEdit && <Checkbox label="Pelanggan aktif" hint="Pelanggan nonaktif tidak muncul saat membuat order." checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}

        <Button type="submit" loading={save.isPending} className="w-full">
          {save.isPending ? 'Menyimpan…' : 'Simpan'}
        </Button>
      </form>
    </Sheet>
  );
}
