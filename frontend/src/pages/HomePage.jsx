import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.mjs';
import { navFor } from '../lib/nav.mjs';
import { Card, Notice, PageHeader, ProgressBar } from '../components/ui.jsx';
import { daysLeftText, formatLiters, formatRupiah } from '../lib/format.mjs';

export default function HomePage() {
  const { user } = useAuth();
  const menu = navFor(user.role).filter((i) => i.to !== '/');

  return (
    <>
      <PageHeader title={`Halo, ${user.name}`}>
        Masuk sebagai {user.role === 'ADMIN' ? 'admin' : 'pemilik'}.
      </PageHeader>

      <Summary />

      {user.role === 'ADMIN' && <SystemStatus />}

      <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
        {menu.map(({ to, label, icon: Icon, desc }) => (
          <li key={to}>
            <Link to={to} className="flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-brand-soft">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-ink">{label}</span>
                <span className="block text-sm text-muted">{desc}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

// Memastikan backend dan database terhubung; berguna saat pertama kali setup dan deploy.
function SystemStatus() {
  const status = useQuery({
    queryKey: ['health-db'],
    queryFn: () => api.get('/api/health/db'),
    retry: false,
  });

  return (
    <Card className="p-4">
      <h2 className="mb-2 text-base font-bold text-ink">Status sistem</h2>
      {status.isPending && <Notice>Memeriksa koneksi database…</Notice>}
      {status.isError && <Notice tone="error">Database belum terhubung: {status.error.message}</Notice>}
      {status.isSuccess && <Notice tone="ok">Server dan database terhubung.</Notice>}
    </Card>
  );
}

// Tiga angka penting: order hari ini, total utang, dan sisa toren. Ketuk untuk membuka detailnya.
function Summary() {
  const summary = useQuery({ queryKey: ['summary'], queryFn: () => api.get('/api/summary') });
  if (summary.isPending) return <p className="mb-4 text-muted">Memuat ringkasan…</p>;
  if (summary.isError) return <Notice tone="error" className="mb-4">{summary.error.message}</Notice>;

  const { orders, totalDebt, tank } = summary.data;
  const tankTone = { OK: 'ok', LOW: 'warn', CRITICAL: 'danger' }[tank.level] ?? 'ok';
  const tankText = tank.known ? formatLiters(Math.max(tank.remainingLiters, 0)) : 'Belum diatur';
  const days = tank.known ? daysLeftText(tank.daysLeft) : null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile to="/order" title="Order hari ini" value={`${orders.orderCount} order`} sub={`${orders.gallons} galon · ${formatRupiah(orders.total)}`} />
      <Tile to="/utang" title="Total utang" value={formatRupiah(totalDebt)} valueClass={totalDebt > 0 ? 'text-danger' : 'text-ok'} sub={totalDebt > 0 ? 'Ketuk untuk melihat' : 'Tidak ada utang'} />
      <Tile
        to="/stok"
        title="Sisa toren"
        value={tankText}
        valueClass={tank.level === 'CRITICAL' ? 'text-danger' : tank.level === 'LOW' ? 'text-warn' : ''}
        sub={tank.known ? (days ? `Habis ${days === 'kurang dari 1 hari' ? days : `± ${days} lagi`}` : `${tank.percent}% terisi`) : 'Atur stok awal'}
      >
        {tank.known && <ProgressBar percent={tank.percent} tone={tankTone} label="Isi toren" />}
      </Tile>
    </div>
  );
}

function Tile({ to, title, value, valueClass = '', sub, children }) {
  return (
    <Link to={to} className="block rounded-2xl border border-line bg-white p-4 hover:bg-brand-soft">
      <p className="text-sm font-semibold text-muted">{title}</p>
      <p className={`text-2xl font-extrabold tracking-tight text-ink ${valueClass}`}>{value}</p>
      <p className="mb-2 text-sm text-muted">{sub}</p>
      {children}
    </Link>
  );
}
