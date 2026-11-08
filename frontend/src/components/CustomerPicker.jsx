import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { formatRupiah } from '../lib/format.mjs';
import { Badge, Sheet, cx } from './ui.jsx';

export function customerTags(c) {
  const tags = [];
  if (c.customPrice) tags.push(`Harga ${formatRupiah(c.customPrice)}`);
  if (c.bundleBuy) tags.push(`Beli ${c.bundleBuy} bayar ${c.bundlePay}`);
  return tags;
}

// Pilih pelanggan atau "Umum" lewat lembar pencarian. value = objek pelanggan atau null (umum).
export default function CustomerPicker({ value, onChange, customers = [], loading = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => c.isActive && (!q || c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)));
  }, [customers, search]);

  function pick(c) {
    onChange(c);
    setOpen(false);
    setSearch('');
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink" id="picker-label">
        Pelanggan
      </p>
      <button
        type="button"
        aria-labelledby="picker-label picker-value"
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 text-left"
      >
        <span id="picker-value" className="min-w-0">
          <span className="block truncate text-base font-bold text-ink">{value ? value.name : 'Umum (tanpa nama)'}</span>
          {value && customerTags(value).length > 0 && <span className="block truncate text-sm text-muted">{customerTags(value).join(' · ')}</span>}
        </span>
        <ChevronDown className="size-5 shrink-0 text-muted" aria-hidden="true" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Pilih pelanggan">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            aria-label="Cari pelanggan"
            placeholder="Cari nama atau nomor telepon"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block min-h-12 w-full rounded-xl border border-line bg-white pr-4 pl-12 text-base"
          />
        </div>
        <ul className="divide-y divide-line">
          <Option selected={!value} onClick={() => pick(null)} title="Umum (tanpa nama)" subtitle="Pembeli yang tidak dicatat namanya; harus lunas" />
          {loading && <li className="py-4 text-muted">Memuat pelanggan…</li>}
          {filtered.map((c) => (
            <Option key={c.id} selected={value?.id === c.id} onClick={() => pick(c)} title={c.name} subtitle={customerTags(c).join(' · ')} />
          ))}
          {!loading && filtered.length === 0 && (
            <li className="py-4 text-muted">{search ? 'Tidak ada pelanggan yang cocok.' : 'Belum ada pelanggan. Tambahkan di menu Pelanggan.'}</li>
          )}
        </ul>
      </Sheet>
    </div>
  );
}

function Option({ selected, onClick, title, subtitle }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-base', selected ? 'font-extrabold text-brand-dark' : 'font-semibold text-ink')}>{title}</span>
          {subtitle && <span className="block truncate text-sm text-muted">{subtitle}</span>}
        </span>
        {selected && <Check className="size-5 shrink-0 text-brand" aria-label="Terpilih" />}
      </button>
    </li>
  );
}

export { Badge };
